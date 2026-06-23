import { FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Button } from "../../components/shared/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/shared/ui/card";
import { Input } from "../../components/shared/ui/input";
import { isStrongPassword, PASSWORD_REQUIREMENTS_MESSAGE, resetPassword } from "../../utils/authApi";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [newPassword, setNewPassword]     = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting]   = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [done, setDone]                   = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!isStrongPassword(newPassword)) { setError(PASSWORD_REQUIREMENTS_MESSAGE); return; }
    if (newPassword !== confirmPassword) { setError("Lösenorden matchar inte."); return; }

    setIsSubmitting(true);
    try {
      await resetPassword(token, newPassword);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Något gick fel. Länken kanske har gått ut.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!token) {
    return (
      <main className="min-h-[calc(100vh-72px)] bg-gray-50 py-16">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-md text-center bg-white border rounded-xl p-10">
            <p className="text-gray-600 mb-4">Ogiltig återställningslänk.</p>
            <Button asChild><Link to="/auth?tab=login">Gå till inloggning</Link></Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[calc(100vh-72px)] bg-gray-50 py-16">
      <div className="container mx-auto px-6">
        <div className="mx-auto max-w-md">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl font-bold">Nytt lösenord</CardTitle>
              <CardDescription>Välj ett nytt lösenord för ditt konto.</CardDescription>
            </CardHeader>
            <CardContent>
              {done ? (
                <div className="space-y-4">
                  <p className="text-sm text-gray-700 bg-green-50 border border-green-200 rounded-lg p-4">
                    Ditt lösenord har uppdaterats. Du kan nu logga in med ditt nya lösenord.
                  </p>
                  <Button asChild className="w-full">
                    <Link to="/auth?tab=login">Logga in</Link>
                  </Button>
                </div>
              ) : (
                <form className="space-y-4" onSubmit={handleSubmit}>
                  <div className="space-y-2">
                    <label htmlFor="new-password" className="text-sm font-medium">Nytt lösenord</label>
                    <Input
                      id="new-password"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minst 8 tecken, stor/liten bokstav + siffra"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="confirm-password" className="text-sm font-medium">Bekräfta lösenord</label>
                    <Input
                      id="confirm-password"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Upprepa lösenordet"
                    />
                  </div>
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  <Button type="submit" className="w-full" disabled={isSubmitting}>
                    {isSubmitting ? "Sparar..." : "Spara nytt lösenord"}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
