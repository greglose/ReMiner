import { useState } from "react";
import { format } from "date-fns";
import { useLeads, useUpdateLeadStatus } from "../hooks/useLeads";
import { Lead, LeadStatus } from "../types";

const statusColors: Record<LeadStatus, string> = {
  new: "bg-blue-100 text-blue-800",
  contacted: "bg-yellow-100 text-yellow-800",
  replied: "bg-green-100 text-green-800",
  qualified: "bg-purple-100 text-purple-800",
  not_interested: "bg-gray-100 text-gray-800",
  converted: "bg-green-200 text-green-900",
};

const statusLabels: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  replied: "Replied",
  qualified: "Qualified",
  not_interested: "Not Interested",
  converted: "Converted",
};

function LeadRow({ lead }: { lead: Lead }) {
  const updateStatus = useUpdateLeadStatus();
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const handleStatusChange = (status: LeadStatus) => {
    updateStatus.mutate({ leadId: lead.id, status });
    setShowStatusMenu(false);
  };

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm font-medium text-gray-900">
          {lead.propertyAddress}
        </div>
        <div className="text-sm text-gray-500">
          {lead.city}, {lead.state} {lead.zip}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="text-sm text-gray-900">{lead.ownerName}</div>
        <div className="text-sm text-gray-500">{lead.ownerEmail || "-"}</div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {lead.ownerPhone || "-"}
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="relative">
          <button
            onClick={() => setShowStatusMenu(!showStatusMenu)}
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[lead.status]}`}
          >
            {statusLabels[lead.status]}
            <svg
              className="ml-1 h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          {showStatusMenu && (
            <div className="absolute z-10 mt-1 w-40 bg-white rounded-lg shadow-lg border border-gray-200 py-1">
              {(Object.keys(statusLabels) as LeadStatus[]).map((status) => (
                <button
                  key={status}
                  onClick={() => handleStatusChange(status)}
                  className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                >
                  {statusLabels[status]}
                </button>
              ))}
            </div>
          )}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        Step {lead.emailSequenceStep}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        <div className="flex gap-1">
          {lead.addedToMetaAudience && (
            <span title="Added to Meta Audience" className="text-purple-500">
              M
            </span>
          )}
          {lead.rvmSentAt && (
            <span title="RVM Sent" className="text-green-500">
              R
            </span>
          )}
          {lead.emailBounced && (
            <span title="Email Bounced" className="text-red-500">
              B
            </span>
          )}
          {lead.onDncList && (
            <span title="On DNC List" className="text-red-500">
              D
            </span>
          )}
        </div>
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
        {format(lead.createdAt.toDate(), "MMM d, yyyy")}
      </td>
    </tr>
  );
}

function Leads() {
  const [statusFilter, setStatusFilter] = useState<LeadStatus | undefined>();
  const { data: leads, isLoading, error } = useLeads(statusFilter);

  if (error) {
    return (
      <div className="card bg-red-50 border-red-200">
        <p className="text-red-700">Failed to load leads: {error.message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Leads</h1>
        <div className="flex items-center gap-4">
          <select
            value={statusFilter || ""}
            onChange={(e) =>
              setStatusFilter((e.target.value as LeadStatus) || undefined)
            }
            className="input w-40"
          >
            <option value="">All Statuses</option>
            {(Object.keys(statusLabels) as LeadStatus[]).map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : !leads || leads.length === 0 ? (
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
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900">No leads yet</h3>
          <p className="mt-2 text-gray-500">
            Leads will appear here once syncing is enabled and listings are
            processed.
          </p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Property
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Owner
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Phone
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Email Step
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Flags
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {leads.map((lead) => (
                  <LeadRow key={lead.id} lead={lead} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default Leads;
