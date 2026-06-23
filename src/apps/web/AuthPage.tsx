import { FormEvent, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../../components/shared/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/shared/ui/card";
import { Input } from "../../components/shared/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/shared/ui/tabs";
import { isStrongPassword, loginUser, PASSWORD_REQUIREMENTS_MESSAGE, registerUser, requestPasswordReset } from "../../utils/authApi";
import type { AuthUser } from "../../types/auth";

type RegisterForm = { username: string; email: string; password: string };
type AuthPageProps = { onLogin: (user: AuthUser) => void };

export function AuthPage({ onLogin }: AuthPageProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") === "login" ? "login" : "register";

  const [activeTab, setActiveTab] = useState(initialTab);
  const [showForgot, setShowForgot] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [registerForm, setRegisterForm] = useState<RegisterForm>({ username: "", email: "", password: "" });
  const [loginForm, setLoginForm]       = useState({ email: "", password: "" });
  const [forgotEmail, setForgotEmail]   = useState("");
  const [forgotSent, setForgotSent]     = useState(false);

  async function handleRegisterSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const clean = { username: registerForm.username.trim(), email: registerForm.email.trim().toLowerCase(), password: registerForm.password };
    if (!clean.username || !clean.email || !clean.password) { setError("Fyll i alla fält."); return; }
    if (!isStrongPassword(clean.password)) { setError(PASSWORD_REQUIREMENTS_MESSAGE); return; }
    setIsSubmitting(true);
    try { onLogin(await registerUser(clean)); navigate("/"); }
    catch (err) { setError(err instanceof Error ? err.message : "Kunde inte registrera konto."); }
    finally { setIsSubmitting(false); }
  }

  async function handleLoginSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const email = loginForm.email.trim().toLowerCase();
    if (!email || !loginForm.password) { setError("Fyll i e-post och lösenord."); return; }
    setIsSubmitting(true);
    try { onLogin(await loginUser({ email, password: loginForm.password })); navigate("/"); }
    catch (err) { setError(err instanceof Error ? err.message : "Fel e-post eller lösenord."); }
    finally { setIsSubmitting(false); }
  }

  async function handleForgotSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const email = forgotEmail.trim().toLowerCase();
    if (!email) { setError("Ange din e-postadress."); return; }
    setIsSubmitting(true);
    try { await requestPasswordReset(email); setForgotSent(true); }
    catch (err) { setError(err instanceof Error ? err.message : "Något gick fel. Försök igen."); }
    finally { setIsSubmitting(false); }
  }

  // ── Forgot password view ──────────────────────────────────────────────────────
  if (showForgot) {
    return (
      <main className="min-h-[calc(100vh-72px)] bg-gray-50 py-16">
        <div className="container mx-auto px-6">
          <div className="mx-auto max-w-md">
            <Card>
              <CardHeader>
                <CardTitle className="text-2xl font-bold">Glömt lösenord</CardTitle>
                <CardDescription>
                  Ange din e-post så skickar vi en återställningslänk.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {forgotSent ? (
                  <div className="space-y-4">
                    <p className="text-sm text-gray-700 bg-green-50 border border-green-200 rounded-lg p-4">
                      Om kontot finns skickas en återställningslänk inom kort. Kolla din inkorg (och skräppost).
                    </p>
                    <Button className="w-full" onClick={() => { setShowForgot(false); setForgotSent(false); setForgotEmail(""); }}>
                      Tillbaka till inloggning
                    </Button>
                  </div>
                ) : (
                  <form className="space-y-4" onSubmit={handleForgotSubmit}>
                    <div className="space-y-2">
                      <label htmlFor="forgot-email" className="text-sm font-medium">E-post</label>
                      <Input
                        id="forgot-email"
                        type="email"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="du@example.com"
                      />
                    </div>
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    <Button type="submit" className="w-full" disabled={isSubmitting}>
                      {isSubmitting ? "Skickar..." : "Skicka återställningslänk"}
                    </Button>
                    <button
                      type="button"
                      onClick={() => { setShowForgot(false); setError(null); }}
                      className="w-full text-sm text-gray-500 hover:text-gray-700"
                    >
                      Tillbaka
                    </button>
                  </form>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    );
  }

  // ── Login / Register view ─────────────────────────────────────────────────────
  return (
    <main className="min-h-[calc(100vh-72px)] bg-gray-50 py-16">
      <div className="container mx-auto px-6">
        <div className="mx-auto max-w-md">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl font-bold">Konto</CardTitle>
              <CardDescription>Skapa konto eller logga in.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v); setError(null); }}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="register">Registrera</TabsTrigger>
                  <TabsTrigger value="login">Logga in</TabsTrigger>
                </TabsList>

                <TabsContent value="register" className="mt-4">
                  <form className="space-y-4" onSubmit={handleRegisterSubmit}>
                    <div className="space-y-2">
                      <label htmlFor="register-username" className="text-sm font-medium">Användarnamn</label>
                      <Input id="register-username" value={registerForm.username}
                        onChange={(e) => setRegisterForm((p) => ({ ...p, username: e.target.value }))}
                        placeholder="t.ex. dansmästare99" />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="register-email" className="text-sm font-medium">E-post</label>
                      <Input id="register-email" type="email" value={registerForm.email}
                        onChange={(e) => setRegisterForm((p) => ({ ...p, email: e.target.value }))}
                        placeholder="du@example.com" />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="register-password" className="text-sm font-medium">Lösenord</label>
                      <Input id="register-password" type="password" value={registerForm.password}
                        onChange={(e) => setRegisterForm((p) => ({ ...p, password: e.target.value }))}
                        placeholder="Minst 8 tecken, stor/liten bokstav + siffra" />
                    </div>
                    <Button type="submit" className="w-full" disabled={isSubmitting}>
                      {isSubmitting ? "Skapar konto..." : "Registrera konto"}
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="login" className="mt-4">
                  <form className="space-y-4" onSubmit={handleLoginSubmit}>
                    <div className="space-y-2">
                      <label htmlFor="login-email" className="text-sm font-medium">E-post</label>
                      <Input id="login-email" type="email" value={loginForm.email}
                        onChange={(e) => setLoginForm((p) => ({ ...p, email: e.target.value }))}
                        placeholder="du@example.com" />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="login-password" className="text-sm font-medium">Lösenord</label>
                      <Input id="login-password" type="password" value={loginForm.password}
                        onChange={(e) => setLoginForm((p) => ({ ...p, password: e.target.value }))}
                        placeholder="Ditt lösenord" />
                    </div>
                    <Button type="submit" className="w-full" disabled={isSubmitting}>
                      {isSubmitting ? "Loggar in..." : "Logga in"}
                    </Button>
                    <div className="text-center">
                      <button
                        type="button"
                        onClick={() => { setShowForgot(true); setError(null); }}
                        className="text-sm text-gray-500 hover:text-purple-600 transition-colors"
                      >
                        Glömt lösenord?
                      </button>
                    </div>
                  </form>
                </TabsContent>
              </Tabs>

              {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  );
}
