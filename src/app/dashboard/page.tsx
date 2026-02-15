import { Activity, CheckCircle, Clock } from "lucide-react";

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-base-content">Dashboard</h1>
        <button className="btn btn-primary">
          New Task
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-base-200 p-6 rounded-xl shadow-sm border border-base-300 flex items-center space-x-4">
          <div className="p-3 bg-primary/20 rounded-full text-primary">
            <CheckCircle size={24} />
          </div>
          <div>
            <p className="text-base-content/70 text-sm">Completed Tasks</p>
            <h3 className="text-2xl font-bold text-base-content">12</h3>
          </div>
        </div>

        <div className="bg-base-200 p-6 rounded-xl shadow-sm border border-base-300 flex items-center space-x-4">
          <div className="p-3 bg-warning/20 rounded-full text-warning">
            <Clock size={24} />
          </div>
          <div>
            <p className="text-base-content/70 text-sm">Pending Reviews</p>
            <h3 className="text-2xl font-bold text-base-content">5</h3>
          </div>
        </div>

        <div className="bg-base-200 p-6 rounded-xl shadow-sm border border-base-300 flex items-center space-x-4">
          <div className="p-3 bg-success/20 rounded-full text-success">
            <Activity size={24} />
          </div>
          <div>
            <p className="text-base-content/70 text-sm">Team Activity</p>
            <h3 className="text-2xl font-bold text-base-content">High</h3>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-base-200 p-6 rounded-xl shadow-sm border border-base-300 h-64">
           <h3 className="font-semibold text-lg text-base-content mb-4">Recent Activity</h3>
           <p className="text-base-content/50 text-sm italic">Connect to Firestore to see real data...</p>
        </div>
        
        <div className="bg-base-200 p-6 rounded-xl shadow-sm border border-base-300 h-64">
           <h3 className="font-semibold text-lg text-base-content mb-4">Team Availability</h3>
           <p className="text-base-content/50 text-sm italic">Connect to Firestore to see real data...</p>
        </div>
      </div>
    </div>
  );
}
