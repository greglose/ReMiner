import { useState, useEffect } from "react";
import { useConfig, useSaveConfig, useToggleSync } from "../hooks/useConfig";
import { EmailSequence } from "../types";

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

const RVM_RESTRICTED_STATES = ["FL", "PA"];

function Settings() {
  const { data: config, isLoading } = useConfig();
  const saveConfig = useSaveConfig();
  const toggleSync = useToggleSync();

  const [formData, setFormData] = useState({
    name: "",
    batchLeadsApiKey: "",
    sendgridApiKey: "",
    metaAccessToken: "",
    metaAdAccountId: "",
    slybroadcastApiKey: "",
    emailFromAddress: "",
    emailFromName: "",
    companyName: "",
    companyAddress: "",
    rvmBlockedStates: [] as string[],
    emailSequences: [] as EmailSequence[],
  });

  useEffect(() => {
    if (config) {
      setFormData({
        name: config.name || "",
        batchLeadsApiKey: config.batchLeadsApiKey || "",
        sendgridApiKey: config.sendgridApiKey || "",
        metaAccessToken: config.metaAccessToken || "",
        metaAdAccountId: config.metaAdAccountId || "",
        slybroadcastApiKey: config.slybroadcastApiKey || "",
        emailFromAddress: config.emailFromAddress || "",
        emailFromName: config.emailFromName || "",
        companyName: config.companyName || "",
        companyAddress: config.companyAddress || "",
        rvmBlockedStates: config.rvmBlockedStates || RVM_RESTRICTED_STATES,
        emailSequences: config.emailSequences || [
          { step: 1, subject: "", bodyTemplate: "", delayDays: 0 },
        ],
      });
    } else {
      setFormData((prev) => ({
        ...prev,
        rvmBlockedStates: RVM_RESTRICTED_STATES,
        emailSequences: [
          { step: 1, subject: "", bodyTemplate: "", delayDays: 0 },
        ],
      }));
    }
  }, [config]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await saveConfig.mutateAsync({
      ...(config?.id ? { id: config.id } : {}),
      ...formData,
    });
  };

  const handleToggleSync = () => {
    if (config?.id) {
      toggleSync.mutate({ configId: config.id, enabled: !config.syncEnabled });
    }
  };

  const addEmailSequence = () => {
    setFormData((prev) => ({
      ...prev,
      emailSequences: [
        ...prev.emailSequences,
        {
          step: prev.emailSequences.length + 1,
          subject: "",
          bodyTemplate: "",
          delayDays: 3,
        },
      ],
    }));
  };

  const updateEmailSequence = (
    index: number,
    field: keyof EmailSequence,
    value: string | number
  ) => {
    setFormData((prev) => ({
      ...prev,
      emailSequences: prev.emailSequences.map((seq, i) =>
        i === index ? { ...seq, [field]: value } : seq
      ),
    }));
  };

  const removeEmailSequence = (index: number) => {
    setFormData((prev) => ({
      ...prev,
      emailSequences: prev.emailSequences
        .filter((_, i) => i !== index)
        .map((seq, i) => ({ ...seq, step: i + 1 })),
    }));
  };

  const toggleRvmState = (state: string) => {
    setFormData((prev) => ({
      ...prev,
      rvmBlockedStates: prev.rvmBlockedStates.includes(state)
        ? prev.rvmBlockedStates.filter((s) => s !== state)
        : [...prev.rvmBlockedStates, state],
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        {config && (
          <button
            onClick={handleToggleSync}
            disabled={toggleSync.isPending}
            className={`btn ${config.syncEnabled ? "btn-danger" : "btn-primary"}`}
          >
            {config.syncEnabled ? "Pause Sync" : "Enable Sync"}
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* General */}
        <section className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">General</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="label">Configuration Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                className="input"
                placeholder="My Campaign"
                required
              />
            </div>
          </div>
        </section>

        {/* API Keys */}
        <section className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">API Keys</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="label">BatchLeads API Key</label>
              <input
                type="password"
                value={formData.batchLeadsApiKey}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    batchLeadsApiKey: e.target.value,
                  }))
                }
                className="input"
                placeholder="••••••••"
                required
              />
            </div>
            <div>
              <label className="label">SendGrid API Key</label>
              <input
                type="password"
                value={formData.sendgridApiKey}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    sendgridApiKey: e.target.value,
                  }))
                }
                className="input"
                placeholder="••••••••"
                required
              />
            </div>
            <div>
              <label className="label">Meta Access Token (Optional)</label>
              <input
                type="password"
                value={formData.metaAccessToken}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    metaAccessToken: e.target.value,
                  }))
                }
                className="input"
                placeholder="••••••••"
              />
            </div>
            <div>
              <label className="label">Meta Ad Account ID (Optional)</label>
              <input
                type="text"
                value={formData.metaAdAccountId}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    metaAdAccountId: e.target.value,
                  }))
                }
                className="input"
                placeholder="act_123456789"
              />
            </div>
            <div>
              <label className="label">Slybroadcast API Key (Optional)</label>
              <input
                type="password"
                value={formData.slybroadcastApiKey}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    slybroadcastApiKey: e.target.value,
                  }))
                }
                className="input"
                placeholder="••••••••"
              />
            </div>
          </div>
        </section>

        {/* Email Settings */}
        <section className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Email Settings
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="label">From Email Address</label>
              <input
                type="email"
                value={formData.emailFromAddress}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    emailFromAddress: e.target.value,
                  }))
                }
                className="input"
                placeholder="you@yourdomain.com"
                required
              />
            </div>
            <div>
              <label className="label">From Name</label>
              <input
                type="text"
                value={formData.emailFromName}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    emailFromName: e.target.value,
                  }))
                }
                className="input"
                placeholder="John Smith"
                required
              />
            </div>
            <div>
              <label className="label">Company Name</label>
              <input
                type="text"
                value={formData.companyName}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    companyName: e.target.value,
                  }))
                }
                className="input"
                placeholder="ABC Real Estate LLC"
                required
              />
            </div>
            <div>
              <label className="label">Company Address (CAN-SPAM)</label>
              <input
                type="text"
                value={formData.companyAddress}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    companyAddress: e.target.value,
                  }))
                }
                className="input"
                placeholder="123 Main St, City, ST 12345"
                required
              />
            </div>
          </div>
        </section>

        {/* Email Sequences */}
        <section className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Email Sequences
            </h2>
            <button type="button" onClick={addEmailSequence} className="btn btn-secondary">
              Add Step
            </button>
          </div>
          <div className="space-y-6">
            {formData.emailSequences.map((seq, index) => (
              <div
                key={index}
                className="border border-gray-200 rounded-lg p-4"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-gray-700">
                    Step {seq.step}
                  </h3>
                  {index > 0 && (
                    <button
                      type="button"
                      onClick={() => removeEmailSequence(index)}
                      className="text-red-600 hover:text-red-700 text-sm"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="md:col-span-2">
                    <label className="label">Subject</label>
                    <input
                      type="text"
                      value={seq.subject}
                      onChange={(e) =>
                        updateEmailSequence(index, "subject", e.target.value)
                      }
                      className="input"
                      placeholder="Interested in your property at {{address}}"
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Delay (days)</label>
                    <input
                      type="number"
                      min="0"
                      value={seq.delayDays}
                      onChange={(e) =>
                        updateEmailSequence(
                          index,
                          "delayDays",
                          parseInt(e.target.value) || 0
                        )
                      }
                      className="input"
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <label className="label">Body Template</label>
                  <textarea
                    value={seq.bodyTemplate}
                    onChange={(e) =>
                      updateEmailSequence(index, "bodyTemplate", e.target.value)
                    }
                    className="input min-h-[120px]"
                    placeholder="Hi {{ownerName}},&#10;&#10;I noticed your property at {{address}}..."
                    required
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Variables: {"{{ownerName}}"}, {"{{address}}"}, {"{{city}}"},{" "}
                    {"{{state}}"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* RVM State Restrictions */}
        <section className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            RVM Blocked States
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Select states where RVMs should NOT be sent (FL and PA are legally
            restricted).
          </p>
          <div className="flex flex-wrap gap-2">
            {US_STATES.map((state) => {
              const isRestricted = RVM_RESTRICTED_STATES.includes(state);
              const isBlocked = formData.rvmBlockedStates.includes(state);
              return (
                <button
                  key={state}
                  type="button"
                  onClick={() => !isRestricted && toggleRvmState(state)}
                  disabled={isRestricted}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                    isBlocked
                      ? "bg-red-100 text-red-800 border border-red-300"
                      : "bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200"
                  } ${isRestricted ? "cursor-not-allowed opacity-75" : ""}`}
                  title={isRestricted ? "Legally restricted" : undefined}
                >
                  {state}
                </button>
              );
            })}
          </div>
        </section>

        {/* Submit */}
        <div className="flex justify-end gap-4">
          <button
            type="submit"
            disabled={saveConfig.isPending}
            className="btn btn-primary"
          >
            {saveConfig.isPending ? "Saving..." : "Save Configuration"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default Settings;
