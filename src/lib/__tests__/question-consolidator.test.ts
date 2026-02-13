import { describe, it, expect } from "vitest";
import { consolidateAndPrioritizeQuestions } from "../question-consolidator";

describe("consolidateAndPrioritizeQuestions", () => {
  it("extracts questions from multiple agents", () => {
    const results = {
      "financial-auditor": {
        success: true,
        data: {
          questions: [
            { question: "What is your current MRR?", priority: "HIGH" },
            { question: "Show bank statements", priority: "CRITICAL" },
          ],
        },
      },
      "team-investigator": {
        success: true,
        data: {
          questionsForFounder: [
            { question: "When did the CTO join?", priority: "MEDIUM" },
          ],
        },
      },
    };

    const consolidated = consolidateAndPrioritizeQuestions(results, []);
    expect(consolidated.length).toBe(3);
  });

  it("deduplicates similar questions", () => {
    const results = {
      "financial-auditor": {
        success: true,
        data: { questions: [{ question: "What is your MRR?" }] },
      },
      "customer-intel": {
        success: true,
        data: { questions: [{ question: "What is your MRR?" }] },
      },
    };

    const consolidated = consolidateAndPrioritizeQuestions(results, []);
    expect(consolidated.length).toBe(1);
    expect(consolidated[0].crossAgentCount).toBe(2);
    expect(consolidated[0].sources).toContain("financial-auditor");
    expect(consolidated[0].sources).toContain("customer-intel");
  });

  it("scores CRITICAL higher than LOW", () => {
    const results = {
      "agent1": {
        success: true,
        data: {
          questions: [
            { question: "Critical question here", priority: "CRITICAL" },
            { question: "Low priority thing", priority: "LOW" },
          ],
        },
      },
    };

    const consolidated = consolidateAndPrioritizeQuestions(results, []);
    expect(consolidated[0].question).toContain("Critical");
    expect(consolidated[0].priorityScore).toBeGreaterThan(consolidated[1].priorityScore);
  });

  it("boosts questions linked to red flags", () => {
    const results = {
      "agent1": {
        success: true,
        data: {
          questions: [
            { question: "What about the high burn rate issue?", priority: "MEDIUM" },
            { question: "Tell me about the team", priority: "MEDIUM" },
          ],
        },
      },
    };

    const consolidated = consolidateAndPrioritizeQuestions(results, ["High Burn Rate"]);
    const burnQuestion = consolidated.find(q => q.question.includes("burn rate"));
    const teamQuestion = consolidated.find(q => q.question.includes("team"));
    expect(burnQuestion!.linkedToRedFlag).toBe(true);
    expect(burnQuestion!.priorityScore).toBeGreaterThan(teamQuestion!.priorityScore);
  });

  it("boosts cross-agent questions", () => {
    const results = {
      "agent1": { success: true, data: { questions: [{ question: "ARR verification needed" }] } },
      "agent2": { success: true, data: { questions: [{ question: "ARR verification needed" }] } },
      "agent3": { success: true, data: { questions: [{ question: "Unique question" }] } },
    };

    const consolidated = consolidateAndPrioritizeQuestions(results, []);
    const arrQ = consolidated.find(q => q.question.includes("ARR"));
    const uniqueQ = consolidated.find(q => q.question.includes("Unique"));
    expect(arrQ!.priorityScore).toBeGreaterThan(uniqueQ!.priorityScore);
  });

  it("handles string-only questions", () => {
    const results = {
      "agent1": {
        success: true,
        data: { questions: ["Simple string question"] },
      },
    };

    const consolidated = consolidateAndPrioritizeQuestions(results, []);
    expect(consolidated.length).toBe(1);
    expect(consolidated[0].question).toBe("Simple string question");
  });

  it("skips failed agents", () => {
    const results = {
      "failed": { success: false },
      "working": { success: true, data: { questions: [{ question: "Valid question" }] } },
    };

    const consolidated = consolidateAndPrioritizeQuestions(results, []);
    expect(consolidated.length).toBe(1);
  });

  it("infers category from agent name", () => {
    const results = {
      "financial-auditor": { success: true, data: { questions: [{ question: "MRR?" }] } },
      "team-investigator": { success: true, data: { questions: [{ question: "CTO?" }] } },
      "market-intelligence": { success: true, data: { questions: [{ question: "TAM?" }] } },
    };

    const consolidated = consolidateAndPrioritizeQuestions(results, []);
    const fin = consolidated.find(q => q.question === "MRR?");
    const team = consolidated.find(q => q.question === "CTO?");
    const market = consolidated.find(q => q.question === "TAM?");
    expect(fin!.category).toBe("FINANCIAL");
    expect(team!.category).toBe("TEAM");
    expect(market!.category).toBe("MARKET");
  });

  it("returns sorted by priorityScore descending", () => {
    const results = {
      "a1": { success: true, data: { questions: [{ question: "Low", priority: "LOW" }] } },
      "a2": { success: true, data: { questions: [{ question: "Critical", priority: "CRITICAL" }] } },
      "a3": { success: true, data: { questions: [{ question: "High", priority: "HIGH" }] } },
    };

    const consolidated = consolidateAndPrioritizeQuestions(results, []);
    for (let i = 1; i < consolidated.length; i++) {
      expect(consolidated[i - 1].priorityScore).toBeGreaterThanOrEqual(consolidated[i].priorityScore);
    }
  });

  it("caps priorityScore at 100", () => {
    // A CRITICAL + linked to red flag + cross-agent + BLOCKER = could exceed 100
    const results = {
      "a1": { success: true, data: { questions: [{ question: "Something about burn rate", priority: "CRITICAL" }] } },
      "a2": { success: true, data: { questions: [{ question: "Something about burn rate", priority: "CRITICAL" }] } },
      "a3": { success: true, data: { questions: [{ question: "Something about burn rate", priority: "CRITICAL" }] } },
    };

    const consolidated = consolidateAndPrioritizeQuestions(results, ["Burn Rate"]);
    expect(consolidated[0].priorityScore).toBeLessThanOrEqual(100);
  });
});
