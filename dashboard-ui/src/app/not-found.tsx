export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-primary">404</h1>
        <h2 className="text-2xl font-semibold mt-4">Página não encontrada</h2>
        <p className="text-muted-foreground mt-2">
          A página que você procura não existe.
        </p>
        <a
          href="/"
          className="inline-block mt-6 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
        >
          Voltar ao início
        </a>
      </div>
    </div>
  );
}
