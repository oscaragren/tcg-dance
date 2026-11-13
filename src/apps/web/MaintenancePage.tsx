import type { MaintenanceStatus } from "../../utils/gameApi";

/** Shown to players instead of the game while maintenance mode is on. */
export default function MaintenancePage({ status }: { status: MaintenanceStatus }) {
  const reopens = status.reopensAt
    ? new Date(status.reopensAt).toLocaleString("sv-SE", { dateStyle: "long", timeStyle: "short" })
    : null;
  return (
    <div className="min-h-screen bg-background text-text flex items-center justify-center px-4">
      <div className="max-w-md text-center space-y-3">
        <h1 className="text-3xl font-bold">Vi uppdaterar</h1>
        {status.note && <p className="text-muted-foreground">{status.note}</p>}
        <p className="text-sm">
          {reopens ? <>Vi öppnar igen ungefär <strong>{reopens}</strong>.</> : "Vi öppnar igen så snart vi är klara."}
        </p>
      </div>
    </div>
  );
}
