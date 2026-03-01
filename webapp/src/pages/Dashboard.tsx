import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useLeadStats } from "../hooks/useLeads";
import { useOutreachStats } from "../hooks/useOutreachStats";
import { useConfig } from "../hooks/useConfig";
import { format } from "date-fns";

function StatCard({
  title,
  value,
  subtitle,
  color = "primary",
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  color?: "primary" | "green" | "yellow" | "red";
}) {
  const colorClasses = {
    primary: "bg-primary-50 text-primary-600",
    green: "bg-green-50 text-green-600",
    yellow: "bg-yellow-50 text-yellow-600",
    red: "bg-red-50 text-red-600",
  };

  return (
    <div className="card">
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          <span className="text-2xl font-bold">{value}</span>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          {subtitle && <p className="text-xs text-gray-400">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}

function Dashboard() {
  const { data: leadStats, isLoading: leadsLoading } = useLeadStats();
  const { data: outreachStats, isLoading: outreachLoading } =
    useOutreachStats(30);
  const { data: config } = useConfig();

  if (leadsLoading || outreachLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const chartData =
    outreachStats?.dailyStats.map((day) => ({
      ...day,
      date: format(new Date(day.date), "MMM d"),
    })) || [];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              config?.syncEnabled
                ? "bg-green-100 text-green-800"
                : "bg-gray-100 text-gray-800"
            }`}
          >
            {config?.syncEnabled ? "Sync Active" : "Sync Paused"}
          </span>
        </div>
      </div>

      {/* Lead Stats */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Lead Pipeline
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <StatCard
            title="Total Leads"
            value={leadStats?.totalLeads || 0}
            color="primary"
          />
          <StatCard
            title="New"
            value={leadStats?.newLeads || 0}
            color="primary"
          />
          <StatCard
            title="Contacted"
            value={leadStats?.contacted || 0}
            color="yellow"
          />
          <StatCard
            title="Replied"
            value={leadStats?.replied || 0}
            color="green"
          />
          <StatCard
            title="Qualified"
            value={leadStats?.qualified || 0}
            color="green"
          />
          <StatCard
            title="Converted"
            value={leadStats?.converted || 0}
            color="green"
          />
        </div>
      </section>

      {/* Outreach Stats */}
      <section>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Outreach Performance (30 Days)
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            title="Emails Sent"
            value={outreachStats?.totals.emailsSent || 0}
            subtitle={`${outreachStats?.openRate || 0}% open rate`}
          />
          <StatCard
            title="Emails Opened"
            value={outreachStats?.totals.emailsOpened || 0}
            subtitle={`${outreachStats?.clickRate || 0}% click rate`}
            color="green"
          />
          <StatCard
            title="RVMs Sent"
            value={outreachStats?.totals.rvmsSent || 0}
          />
          <StatCard
            title="Meta Audience"
            value={outreachStats?.totals.metaAdded || 0}
            subtitle="contacts added"
          />
        </div>

        {/* Chart */}
        <div className="card">
          <h3 className="text-sm font-medium text-gray-700 mb-4">
            Daily Outreach Activity
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  stroke="#9ca3af"
                />
                <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: "8px",
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="emailsSent"
                  name="Emails"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="rvmsSent"
                  name="RVMs"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="metaAdded"
                  name="Meta Adds"
                  stroke="#8b5cf6"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Quick Actions */}
      {!config && (
        <section className="card bg-primary-50 border-primary-200">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0">
              <svg
                className="h-6 w-6 text-primary-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-medium text-primary-800">
                Setup Required
              </h3>
              <p className="mt-1 text-sm text-primary-700">
                Configure your API keys and email sequences to start generating
                leads. Head to Settings to get started.
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export default Dashboard;
