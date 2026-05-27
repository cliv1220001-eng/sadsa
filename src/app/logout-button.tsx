"use client";

export default function LogoutButton() {
  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }
  return (
    <button
      onClick={logout}
      className="rounded-full px-3 py-1.5 text-sm text-zinc-300 transition-colors hover:bg-white/10 hover:text-white"
    >
      Logout
    </button>
  );
}
