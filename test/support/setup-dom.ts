// jsdom lacks the browser APIs the viewer's components reach for; only DOM-environment test files need them.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// jsdom never loads a stylesheet and never fires its `load` or `error`, so a page that waits for its font links (settled() in the print
// book waits for every stylesheet to answer before it measures) would wait for its time limit while a test waits one second. In a
// browser every link answers; here each one answers as soon as it is in the page, the way a stylesheet that arrived does.
if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  const answer = (node: Node): void => {
    if (node instanceof HTMLLinkElement && node.rel.split(/\s+/).includes('stylesheet')) queueMicrotask(() => node.dispatchEvent(new Event('load')));
    if (node instanceof Element) for (const link of node.querySelectorAll('link[rel~="stylesheet"]')) answer(link);
  };
  new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) answer(node);
  }).observe(document, { childList: true, subtree: true });
  document.querySelectorAll('link[rel~="stylesheet"]').forEach(answer);
}
