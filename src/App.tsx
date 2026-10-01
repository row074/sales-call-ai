import { AuthScreen } from "./AuthScreen";
import { CallAssistant } from "./CallAssistant";
import { useAuth } from "./useAuth";

export default function App() {
  const auth = useAuth();

  if (!auth.ready) {
    return (
      <main className="app">
        <h1>Sales Call AI Assistant</h1>
        <p>Loading...</p>
      </main>
    );
  }

  if (!auth.user) {
    return (
      <AuthScreen
        busy={auth.busy}
        error={auth.error}
        configured={auth.configured}
        onSignIn={auth.signIn}
        onCreateAccount={auth.createAccount}
      />
    );
  }

  return (
    <CallAssistant
      key={auth.user.uid}
      email={auth.user.email ?? "Unknown user"}
      onSignOut={auth.signOut}
    />
  );
}
