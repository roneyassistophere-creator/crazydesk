import { Activity, CheckCircle, Clock } from "lucide-react";

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>
        <button className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition">
          New Task
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center space-x-4">
          <div className="p-3 bg-blue-100 rounded-full text-blue-600">
            <CheckCircle size={24} />
          </div>
          <div>
            <p className="text-gray-500 text-sm">Completed Tasks</p>
            <h3 className="text-2xl font-bold text-gray-800">12</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center space-x-4">
          <div className="p-3 bg-yellow-100 rounded-full text-yellow-600">
            <Clock size={24} />
          </div>
          <div>
            <p className="text-gray-500 text-sm">Pending Reviews</p>
            <h3 className="text-2xl font-bold text-gray-800">5</h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center space-x-4">
          <div className="p-3 bg-green-100 rounded-full text-green-600">
            <Activity size={24} />
          </div>
          <div>
            <p className="text-gray-500 text-sm">Team Activity</p>
            <h3 className="text-2xl font-bold text-gray-800">High</h3>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-64">
           <h3 className="font-semibold text-lg text-gray-800 mb-4">Recent Activity</h3>
           <p className="text-gray-400 text-sm italic">Connect to Firestore to see real data...</p>
        </div>
        
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-64">
           <h3 className="font-semibold text-lg text-gray-800 mb-4">Team Availability</h3>
           <p className="text-gray-400 text-sm italic">Connect to Firestore to see real data...</p>
        </div>
      </div>
    </div>
  );
}
