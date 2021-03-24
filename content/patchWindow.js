"use strict";

function patchWindow(patchingCallback, env = {}) {
  let nativeExport = this && this.exportFunction || typeof exportFunction == "function";
  if (!nativeExport) {
    // Chromium
    let exportFunction = (func, targetObject, {defineAs}) => {
      try {
        let  [propDef, getOrSet, propName] = /^([gs]et)(?:\s+(\w+))$/.exec(defineAs) || [null, null, defineAs];
        let propDes = Object.getOwnPropertyDescriptor(targetObject, propName);
        let original = propDef && propDef ? propDes[getOrSet] : targetObject[defineAs];

        let proxy = new Proxy(original, {
          apply(target, thisArg, args) {
            return func.apply(thisArg, args);
          }
        });
        if (!propDes) {
          targetObject[propName] = proxy;
        } else {
          if (getOrSet) {
            propDes[getOrSet] = proxy;
          } else {
            if ("value" in propDes) {
              propDes.value = proxy;
            } else {
              return exportFunction(() => proxy, targetObject, `get ${propName}`);
            }
          }
          Object.defineProperty(targetObject, propName, propDes);
        }
        return proxy;
      } catch (e) {
        console.error(e, `setting ${targetObject}.${defineAs}`, func);
      }
      return null;
    };
    let cloneInto = (obj, targetObject) => {
      return obj; // dummy for assignment
    };
    let script = document.createElement("script");
    script.text = `
    (() => {
      let patchWindow = ${patchWindow};
      let cloneInto = ${cloneInto};
      let exportFunction = ${exportFunction};
      ({
        patchWindow,
        exportFunction,
        cloneInto,
      }).patchWindow(${patchingCallback}, ${JSON.stringify(env)});
    })();
    `;
    document.documentElement.insertBefore(script, document.documentElement.firstChild);
    script.remove();
    return;
  }

  // win: window object to modify.
  // modifyTarget: callback to function that modifies the desired properties
  //                or methods. Callback must take target window as argument.
  function modifyWindow(win, modifyTarget) {
    try {
      modifyTarget(win.wrappedJSObject || win, env);
      modifyWindowOpenMethod(win, modifyTarget);
      modifyFramingElements(win, modifyTarget);
      // we don't need to modify win.opener, read skriptimaahinen notes
      // at https://forums.informaction.com/viewtopic.php?p=103754#p103754
    } catch (e) {
      if (e instanceof DOMException && e.name === "SecurityError") {
        // In case someone tries to access SOP restricted window.
        // We can just ignore this.
      } else throw e;
    }
  }

  function modifyWindowOpenMethod(win, modifyTarget) {
    let windowOpen = win.wrappedJSObject ? win.wrappedJSObject.open : win.open;
    exportFunction(function(...args) {
      let newWin = windowOpen.call(this, ...args);
      if (newWin) modifyWindow(newWin, modifyTarget);
      return newWin;
    }, win, {defineAs: "open"});
  }

  function modifyFramingElements(win, modifyTarget) {
    for (let property of ["contentWindow", "contentDocument"]) {
      for (let iface of ["Frame", "IFrame", "Object"]) {
        let proto = win[`HTML${iface}Element`].prototype;
        modifyContentProperties(proto, property, modifyTarget)
      }
    }
  }

  function modifyContentProperties(proto, property, modifyTarget) {
    let descriptor = Object.getOwnPropertyDescriptor(proto, property);
    let origGetter = descriptor.get;
    let replacementFn;

    if (property === "contentWindow") { replacementFn = function() {
      let win = origGetter.call(this);
      if (win) modifyWindow(win, modifyTarget);
      return win;
    }}
    if (property === "contentDocument") { replacementFn = function() {
      let document = origGetter.call(this);
      if (document && document.defaultView) modifyWindow(document.defaultView, modifyTarget);
      return document;
    }}

    descriptor.get = exportFunction(replacementFn, proto, {defineAs: `get ${property}`});
    let wrappedProto = proto.wrappedJSObject || proto;
    Object.defineProperty(wrappedProto, property, descriptor);
  }

  return modifyWindow(window, patchingCallback);
}
