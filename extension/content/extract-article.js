(() => {
  const clone = document.cloneNode(true);
  const article = new Readability(clone, { keepClasses: false }).parse();
  if (!article || !article.content) return { ok: false };
  return {
    ok: true,
    title: article.title || document.title,
    byline: article.byline || "",
    siteName: article.siteName || location.hostname,
    lang: article.lang || document.documentElement.lang || "",
    content: article.content,
    url: location.href,
  };
})();
