/* Admin config — change these before sharing the admin URL with the client.
 *
 * PASSWORD_SHA256: SHA-256 hex of the shared admin password.
 *   Default password is "msHofAdmin2026" — change it, then update this hash.
 *   In a browser console: crypto.subtle.digest("SHA-256", new TextEncoder().encode("your-password"))
 *     .then(b => console.log([...new Uint8Array(b)].map(x => x.toString(16).padStart(2,"0")).join("")))
 *
 * GITHUB_*: used by Save to commit data/*.json via the Contents API.
 *   Create a fine-grained PAT with Contents: Read and write on this repo only.
 *   Paste the token in the admin Save dialog (it stays in sessionStorage only).
 */
window.MSHOF_ADMIN = {
  PASSWORD_SHA256:
    "b3e9da50f0bb78f60a330a630235269d01f61bb354566a8d9a7c3f59e1289c5e",
  GITHUB_OWNER: "atreyukun",
  GITHUB_REPO: "mobilesportshalloffame",
  GITHUB_BRANCH: "main",
  // Relative paths from repo root that the admin may write.
  DATA_FILES: {
    news: "data/news.json",
    event: "data/event.json",
    partners: "data/partners.json",
    sponsors: "data/sponsors.json",
    board: "data/board.json",
  },
};
