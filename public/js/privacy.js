(async function () {
  try { await requireAuth(); } catch (e) { return; }
  bindLogout();
})();
