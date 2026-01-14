// src/components/dashboard/ui/IssueForm.tsx

import type { Id } from "@convex/_generated/dataModel";

import { useState } from "react";

import { Button, Group, Text, TextInput } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useAction, useQuery } from "convex/react";
import { ConvexError } from "convex/values";

import { api } from "@convex/_generated/api";

interface IssueFormProps {
  onReportGenerated: (reportId: Id<"reports">) => void;
  isAnalysisRunning: boolean;
  setIsAnalysisRunning: (isRunning: boolean) => void;
  disabled?: boolean;
}

export function IssueForm({ onReportGenerated, isAnalysisRunning, setIsAnalysisRunning, disabled = false }: IssueFormProps) {
  const storeIssues = useAction(api.githubIssues.storeIssues);
  const currentUser = useQuery(api.users.getCurrentUser);
  const [error, setError] = useState<string | null>(null);

  const form = useForm({
    initialValues: { repoUrl: "", keyword: "" },
    validate: {
      repoUrl: (value) => (/^https:\/\/github\.com\/[\w-]+\/[\w-]+$/.test(value) ? null : "Invalid GitHub repository URL"),
      keyword: (value) => (value.length > 0 ? null : "Keyword is required"),
    },
  });

  const handleSubmit = async (values: typeof form.values) => {
    if (!currentUser?.email) {
      setError("User email not found. Please log in again.");
      return;
    }
    setIsAnalysisRunning(true);
    setError(null);
    try {
      const newReportId = await storeIssues({
        repoUrl: values.repoUrl,
        keyword: values.keyword.toLowerCase(),
        userEmail: currentUser.email,
      });
      onReportGenerated(newReportId as Id<"reports">);
      form.reset();
    } catch (error) {
      // ConvexError.data can be: undefined, null, string, object, or empty string
      // Prefer data if it's a non-empty string, otherwise use message
      const errorMessage =
        error instanceof ConvexError && typeof error.data === "string" && error.data.length > 0
          ? error.data
          : error instanceof Error
            ? error.message
            : "An unexpected error occurred";
      if (errorMessage.includes("GitHub authentication failed")) {
        setError("GitHub authentication failed. Please contact the administrator to verify the GITHUB_TOKEN.");
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsAnalysisRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      {error && (
        <Text c="red" mb="md" size="sm">
          {error}
        </Text>
      )}
      <form onSubmit={form.onSubmit(handleSubmit)} className="space-y-4">
        <TextInput
          label="GitHub Repository URL"
          placeholder="https://github.com/owner/repo"
          {...form.getInputProps("repoUrl")}
          className="w-full"
          disabled={isAnalysisRunning}
        />
        <TextInput
          label="Keyword"
          placeholder="e.g., authentication"
          {...form.getInputProps("keyword")}
          value={form.values.keyword}
          onChange={(e) => form.setFieldValue("keyword", e.currentTarget.value.toLowerCase())}
          className="w-full"
          disabled={isAnalysisRunning}
          styles={{ input: { textTransform: "lowercase" } }}
        />
        <Group justify="flex-end">
          <Button
            type="submit"
            loading={isAnalysisRunning}
            disabled={isAnalysisRunning || !currentUser?.email || disabled}
            className="bg-[#f5d90a] text-[#111110] transition-all duration-200 hover:bg-[#f5d90ae6]"
          >
            {isAnalysisRunning ? "Processing..." : "Generate Report"}
          </Button>
        </Group>
      </form>
    </div>
  );
}
