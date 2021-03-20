{
  let mozWebExtUrl = typeof document === "object" && document.URL.startsWith("moz-");
  let isMozilla = mozWebExtUrl ||
    (typeof window === "object"
        ? typeof window.wrappedJSObject === "object"
        : "contentScripts" in browser);
  let mobile = false;
  if (isMozilla) {
    if (mozWebExtUrl) {
      // help browser-specific UI styling
      document.documentElement.classList.add("mozwebext");
      mobile = !("windows" in browser);
    }
  } else {
    // shims for non-Mozilla browsers
    if (typeof chrome === "object" && !chrome.tabs) {
      // content script shims
    }
  }

  var UA = {
    isMozilla,
    mobile,
  };
}
