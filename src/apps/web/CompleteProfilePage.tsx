import { FormEvent, useState } from "react";
import { Button } from "../../components/shared/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/shared/ui/card";
import { Input } from "../../components/shared/ui/input";
import { isValidName, NAME_REQUIREMENTS_MESSAGE, updateProfile } from "../../utils/authApi";
import type { AuthUser } from "../../types/auth";

type CompleteProfilePageProps = {
  currentUser: AuthUser;
  onComplete: (user: AuthUser) => void;
  onLogout: () => void;
};

/**
 * Hard gate for accounts registered before first/last name became mandatory.
 * App.tsx renders this instead of the router while `profileComplete` is false,
 * so there is nowhere else in the app to navigate to. The server enforces the
 * same rule on every gameplay route, so skipping this screen with a direct API
 * call does not work either.
 */
export function CompleteProfilePage({ currentUser, onComplete, onLogout }: CompleteProfilePageProps) {
  const [firstName, setFirstName] = useState(currentUser.firstName ?? "");
  const [lastName, setLastName] = useState(currentUser.lastName ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const clean = { firstName: firstName.trim(), lastName: lastName.trim() };
    if (!isValidName(clean.firstName) || !isValidName(clean.lastName)) {
      setError(NAME_REQUIREMENTS_MESSAGE);
      return;
    }

    setIsSubmitting(true);
    try {
      onComplete(await updateProfile(clean));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte spara. Försök igen.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 py-16">
      <div className="container mx-auto px-6">
        <div className="mx-auto max-w-md">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl font-bold">Komplettera din profil</CardTitle>
              <CardDescription>
                Hej {currentUser.username}! Vi behöver ditt riktiga för- och efternamn
                innan du kan fortsätta spela. Ditt namn visas på din spelarprofil, så
                att andra ser vem de byter med. Ditt användarnamn används fortfarande
                i resten av spelet.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <label htmlFor="profile-first-name" className="text-sm font-medium">Förnamn</label>
                  <Input
                    id="profile-first-name"
                    value={firstName}
                    autoComplete="given-name"
                    autoFocus
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Anna"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="profile-last-name" className="text-sm font-medium">Efternamn</label>
                  <Input
                    id="profile-last-name"
                    value={lastName}
                    autoComplete="family-name"
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Andersson"
                  />
                </div>

                {error && <p className="text-sm text-red-600">{error}</p>}

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Sparar..." : "Spara och fortsätt"}
                </Button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={onLogout}
                    className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    Logga ut
                  </button>
                </div>
              </form>
            </CardContent>
          </Card>

          <p className="mt-4 text-center text-xs text-gray-500">
            Vi frågar efter namn för att motverka att samma person spelar med flera konton.
          </p>
        </div>
      </div>
    </main>
  );
}
