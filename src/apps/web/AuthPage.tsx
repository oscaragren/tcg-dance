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

type AuthUser = {
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

  const [registerForm, setRegisterForm] = useState<AuthUser>({
    username: "",
    email: "",
    password: "",
  });

  const [loginForm, setLoginForm] = useState({
    email: "",
    password: "",
  });

  function handleRegisterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanUser: AuthUser = {
      username: registerForm.username.trim(),
      email: registerForm.email.trim().toLowerCase(),
      password: registerForm.password,
    };

    if (!cleanUser.username || !cleanUser.email || !cleanUser.password) {
      setError("Fyll i användarnamn, e-post och lösenord.");
      return;
    }

    localStorage.setItem("tcg-user", JSON.stringify(cleanUser));
    localStorage.setItem("tcg-session", "active");
    onLogin(cleanUser);
    navigate("/");
  }

  function handleLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const rawUser = localStorage.getItem("tcg-user");
    if (!rawUser) {
      setError("Ingen användare finns ännu. Registrera dig först.");
      return;
    }

    const storedUser = JSON.parse(rawUser) as AuthUser;
    const email = loginForm.email.trim().toLowerCase();

    if (storedUser.email !== email || storedUser.password !== loginForm.password) {
      setError("Fel e-post eller lösenord.");
      return;
    }

    localStorage.setItem("tcg-session", "active");
    onLogin(storedUser);
    navigate("/");
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
                    <Button type="submit" className="w-full">
                      Registrera konto
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
                    <Button type="submit" className="w-full">
                      Logga in
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
