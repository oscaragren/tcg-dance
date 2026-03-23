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
import { loginUser, registerUser } from "../../utils/authApi";
import type { AuthUser } from "../../types/auth";

type RegisterForm = {
  username: string;
  email: string;
  password: string;
};

type AuthPageProps = {
  onLogin: (user: AuthUser) => void;
};

export function AuthPage({ onLogin }: AuthPageProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get("tab") === "login" ? "login" : "register";
  const [activeTab, setActiveTab] = useState(initialTab);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [registerForm, setRegisterForm] = useState<RegisterForm>({
    username: "",
    email: "",
    password: "",
  });

  const [loginForm, setLoginForm] = useState({
    email: "",
    password: "",
  });

  async function handleRegisterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const cleanUser: RegisterForm = {
      username: registerForm.username.trim(),
      email: registerForm.email.trim().toLowerCase(),
      password: registerForm.password,
    };

    if (!cleanUser.username || !cleanUser.email || !cleanUser.password) {
      setError("Fyll i användarnamn, e-post och lösenord.");
      return;
    }

    setIsSubmitting(true);
    try {
      const user = await registerUser(cleanUser);
      onLogin(user);
      navigate("/");
    } catch (registerError) {
      setError(
        registerError instanceof Error ? registerError.message : "Kunde inte registrera konto just nu.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const email = loginForm.email.trim().toLowerCase();
    if (!email || !loginForm.password) {
      setError("Fyll i e-post och lösenord.");
      return;
    }

    setIsSubmitting(true);
    try {
      const user = await loginUser({ email, password: loginForm.password });
      onLogin(user);
      navigate("/");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Fel e-post eller lösenord.");
    } finally {
      setIsSubmitting(false);
    }
  }

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
              <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value)}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="register">Registrera</TabsTrigger>
                  <TabsTrigger value="login">Logga in</TabsTrigger>
                </TabsList>

                <TabsContent value="register" className="mt-4">
                  <form className="space-y-4" onSubmit={handleRegisterSubmit}>
                    <div className="space-y-2">
                      <label htmlFor="register-username" className="text-sm font-medium">
                        Användarnamn
                      </label>
                      <Input
                        id="register-username"
                        value={registerForm.username}
                        onChange={(event) =>
                          setRegisterForm((prev) => ({ ...prev, username: event.target.value }))
                        }
                        placeholder="t.ex. dansmästare99"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="register-email" className="text-sm font-medium">
                        E-post
                      </label>
                      <Input
                        id="register-email"
                        type="email"
                        value={registerForm.email}
                        onChange={(event) =>
                          setRegisterForm((prev) => ({ ...prev, email: event.target.value }))
                        }
                        placeholder="du@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="register-password" className="text-sm font-medium">
                        Lösenord
                      </label>
                      <Input
                        id="register-password"
                        type="password"
                        value={registerForm.password}
                        onChange={(event) =>
                          setRegisterForm((prev) => ({ ...prev, password: event.target.value }))
                        }
                        placeholder="Minst 1 tecken"
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={isSubmitting}>
                      {isSubmitting ? "Skapar konto..." : "Registrera konto"}
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="login" className="mt-4">
                  <form className="space-y-4" onSubmit={handleLoginSubmit}>
                    <div className="space-y-2">
                      <label htmlFor="login-email" className="text-sm font-medium">
                        E-post
                      </label>
                      <Input
                        id="login-email"
                        type="email"
                        value={loginForm.email}
                        onChange={(event) =>
                          setLoginForm((prev) => ({ ...prev, email: event.target.value }))
                        }
                        placeholder="du@example.com"
                      />
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="login-password" className="text-sm font-medium">
                        Lösenord
                      </label>
                      <Input
                        id="login-password"
                        type="password"
                        value={loginForm.password}
                        onChange={(event) =>
                          setLoginForm((prev) => ({ ...prev, password: event.target.value }))
                        }
                        placeholder="Ditt lösenord"
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={isSubmitting}>
                      {isSubmitting ? "Loggar in..." : "Logga in"}
                    </Button>
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
