// src/components/dashboard/ui/ReportsList.tsx

import type { Doc, Id } from "@convex/_generated/dataModel";

import { useState } from "react";

import { Button, Group, Paper, Select, Text } from "@mantine/core";
import { useAction, useQuery } from "convex/react";

import { api } from "@convex/_generated/api";

import { IssuesTable } from "./IssuesTable";

interface ReportsListProps {
  reportId: Id<"reports"> | null;
  setReportId: (reportId: Id<"reports"> | null) => void;
}

export function ReportsList({ reportId, setReportId }: ReportsListProps) {
  const [loading, setLoading] = useState(false);
  const reports = useQuery(api.githubIssues.getUserReports) as Doc<"reports">[] | undefined;
  const selectedReport = useQuery(api.githubIssues.getReport, reportId ? { reportId } : "skip") as Doc<"reports"> | null;

  const stopReport = useAction(api.githubIssues.stopReport);
  const deleteReportDeep = useAction(api.githubIssues.deleteReportDeep);

  return (
    <Paper p="md" mt="md" withBorder className="rounded-md border">
      <Text fw={500} mb="md" ta="center">
        Your Reports
      </Text>
      <Select
        label="Select a Report"
        placeholder="Choose a report to view"
        data={reports?.map((report: Doc<"reports">) => ({
          value: report._id,
          label: `${report.repoUrl} - ${report.keyword.toLowerCase()} (${report.isCanceled ? "stopped" : report.isComplete ? "complete" : "processing"})`,
        }))}
        value={reportId}
        onChange={(value) => setReportId(value as Id<"reports"> | null)}
        clearable
        mb="md"
      />
      <Group gap="sm" mb="md">
        <Button
          color="yellow"
          disabled={!reportId || loading}
          onClick={async () => {
            if (!reportId) return;
            setLoading(true);
            try {
              await stopReport({ reportId });
            } finally {
              setLoading(false);
            }
          }}
        >
          Stop
        </Button>
        <Button
          color="red"
          disabled={!reportId || loading}
          onClick={async () => {
            if (!reportId) return;
            if (!confirm("Delete this report and all related data?")) return;
            setLoading(true);
            try {
              await deleteReportDeep({ reportId });
              setReportId(null);
            } finally {
              setLoading(false);
            }
          }}
        >
          Delete
        </Button>
      </Group>
      {reportId && selectedReport && (
        <>
          {!selectedReport.isComplete && (
            <Text c="blue" size="sm" mb="md">
              This report is being processed. Check your email for partial results.
            </Text>
          )}
          <Text c="dimmed" size="sm">
            Last Fetched: {new Date(selectedReport.lastFetched).toLocaleString()}
          </Text>
          <Text c="dimmed" size="sm">
            Results for this repository and keyword are cached for 1 hour.
          </Text>
          <Text c="dimmed" size="sm" mb="lg">
            Data will be refreshed automatically after this period when you submit the same repository and keyword.
          </Text>
          <IssuesTable reportId={reportId} />
        </>
      )}
    </Paper>
  );
}
