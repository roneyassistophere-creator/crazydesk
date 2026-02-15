export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-base-content">Dashboard</h1>
        <button className="btn btn-primary">
          New Task
        </button>
      </div>

      <div className="text-center py-12 text-base-content/50">
        <p>No activity yet.</p>
      </div>
    </div>
  );
}
