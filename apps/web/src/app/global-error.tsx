'use client';
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return <html lang="en"><body><main><h1>myOdd could not load</h1><p>Please try again. Your saved collections remain in your account.</p><button onClick={reset}>Try again</button></main></body></html>;
}
