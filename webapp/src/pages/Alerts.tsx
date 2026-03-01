import { format } from "date-fns";
import {
  useAlerts,
  useMarkAlertRead,
  useMarkAllAlertsRead,
} from "../hooks/useAlerts";
import { Alert } from "../types";

const alertTypeStyles = {
  error: {
    bg: "bg-red-50",
    border: "border-red-200",
    icon: "text-red-600",
    title: "text-red-800",
  },
  warning: {
    bg: "bg-yellow-50",
    border: "border-yellow-200",
    icon: "text-yellow-600",
    title: "text-yellow-800",
  },
  info: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    icon: "text-blue-600",
    title: "text-blue-800",
  },
  success: {
    bg: "bg-green-50",
    border: "border-green-200",
    icon: "text-green-600",
    title: "text-green-800",
  },
};

function AlertIcon({ type }: { type: Alert["type"] }) {
  const styles = alertTypeStyles[type];

  if (type === "error") {
    return (
      <svg
        className={`h-5 w-5 ${styles.icon}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    );
  }

  if (type === "warning") {
    return (
      <svg
        className={`h-5 w-5 ${styles.icon}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
    );
  }

  if (type === "success") {
    return (
      <svg
        className={`h-5 w-5 ${styles.icon}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    );
  }

  return (
    <svg
      className={`h-5 w-5 ${styles.icon}`}
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
  );
}

function AlertCard({ alert }: { alert: Alert }) {
  const markRead = useMarkAlertRead();
  const styles = alertTypeStyles[alert.type];

  return (
    <div
      className={`p-4 rounded-lg border ${styles.bg} ${styles.border} ${
        !alert.read ? "ring-2 ring-offset-2 ring-primary-500" : ""
      }`}
    >
      <div className="flex gap-3">
        <div className="flex-shrink-0">
          <AlertIcon type={alert.type} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <h3 className={`text-sm font-medium ${styles.title}`}>
              {alert.title}
            </h3>
            <span className="text-xs text-gray-500 whitespace-nowrap">
              {format(alert.createdAt.toDate(), "MMM d, h:mm a")}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-700">{alert.message}</p>
          {!alert.read && (
            <button
              onClick={() => markRead.mutate(alert.id)}
              className="mt-2 text-xs text-primary-600 hover:text-primary-500"
            >
              Mark as read
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Alerts() {
  const { data: alerts, isLoading, error } = useAlerts();
  const markAllRead = useMarkAllAlertsRead();

  if (error) {
    return (
      <div className="card bg-red-50 border-red-200">
        <p className="text-red-700">Failed to load alerts: {error.message}</p>
      </div>
    );
  }

  const unreadCount = alerts?.filter((a) => !a.read).length || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Alerts</h1>
          <p className="text-sm text-gray-500 mt-1">
            {unreadCount > 0
              ? `${unreadCount} unread alert${unreadCount > 1 ? "s" : ""}`
              : "All caught up!"}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            className="btn btn-secondary"
          >
            Mark all as read
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : !alerts || alerts.length === 0 ? (
        <div className="card text-center py-12">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900">
            No alerts
          </h3>
          <p className="mt-2 text-gray-500">
            System notifications and warnings will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <AlertCard key={alert.id} alert={alert} />
          ))}
        </div>
      )}
    </div>
  );
}

export default Alerts;
