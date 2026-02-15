'use client';
import { useAuth } from "@/context/AuthContext";
import { CheckCircle, Clock, Users, AlertCircle } from "lucide-react";

export default function Dashboard() {
  const { profile } = useAuth();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-base-content">Dashboard</h1>
          <p className="text-base-content/60">Welcome back, {profile?.displayName || 'User'} ({profile?.role})</p>
        </div>
        <button className="btn btn-primary">
          New Task
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stats shadow bg-base-200">
          <div className="stat">
            <div className="stat-figure text-primary">
              <CheckCircle size={24} />
            </div>
            <div className="stat-title">Active Tasks</div>
            <div className="stat-value text-primary">0</div>
            <div className="stat-desc">21% more than last month</div>
          </div>
        </div>

        <div className="stats shadow bg-base-200">
          <div className="stat">
            <div className="stat-figure text-secondary">
              <Clock size={24} />
            </div>
            <div className="stat-title">Pending</div>
            <div className="stat-value text-secondary">0</div>
            <div className="stat-desc">Tasks awaiting review</div>
          </div>
        </div>

        {profile?.role === 'ADMIN' && (
          <div className="stats shadow bg-base-200">
            <div className="stat">
              <div className="stat-figure text-accent">
                <Users size={24} />
              </div>
              <div className="stat-title">Team members</div>
              <div className="stat-value text-accent">1</div>
              <div className="stat-desc">Active users</div>
            </div>
          </div>
        )}

        <div className="stats shadow bg-base-200">
          <div className="stat">
            <div className="stat-figure text-error">
              <AlertCircle size={24} />
            </div>
            <div className="stat-title">Urgent</div>
            <div className="stat-value text-error">0</div>
            <div className="stat-desc">High priority items</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
        <div className="card bg-base-200 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">Recent Activity</h2>
            <div className="divider my-0"></div>
            <div className="text-center py-8 text-base-content/40 italic">
              No recent activity to show.
            </div>
          </div>
        </div>

        <div className="card bg-base-200 shadow-xl">
          <div className="card-body">
            <h2 className="card-title">My Tasks</h2>
            <div className="divider my-0"></div>
            <div className="text-center py-8 text-base-content/40 italic">
              You're all caught up!
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
