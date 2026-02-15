import Link from 'next/link';

export default function Home() {
  return (
    <div className="hero min-h-screen bg-base-200">
      <div className="hero-content text-center">
        <div className="max-w-md">
          <h1 className="text-5xl font-bold bg-linear-to-r from-primary to-secondary bg-clip-text text-transparent mb-8">Crazy Desk</h1>
          <p className="py-6 text-xl">
            Streamline your team's workflow with the ultimate task management solution.
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/login" className="btn btn-primary">Sign In</Link>
            <Link href="/signup" className="btn btn-outline btn-secondary">Get Started</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
