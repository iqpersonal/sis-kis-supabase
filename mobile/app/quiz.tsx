import { useState, useEffect, useRef, useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  ActivityIndicator, Animated, Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { colors, spacing, fontSize, radius, commonStyles } from "@/lib/theme";
import { quizApi, quizGet } from "@/lib/quiz-api";

/* ─── Types ──────────────────────────────────────────────── */

interface Option {
  label: string;
  text: string;
  text_ar?: string;
}

interface Question {
  id: string;
  text: string;
  text_ar?: string;
  options: Option[];
  difficulty: number;
  question_number: number;
  total_questions: number;
}

type Phase = "loading" | "info" | "question" | "feedback" | "cooldown" | "finished";

interface FinishResult {
  score: number;
  total: number;
  percentage: number;
  mastery: string;
  estimated_ability: number;
  time_spent_seconds: number;
  difficulty_breakdown: Record<string, { correct: number; total: number }>;
}

/* ─── Component ──────────────────────────────────────────── */

export default function QuizScreen() {
  const { assignmentId, studentId, studentName } = useLocalSearchParams<{
    assignmentId: string;
    studentId: string;
    studentName: string;
  }>();
  const router = useRouter();

  const [phase, setPhase] = useState<Phase>("loading");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    correct: boolean;
    correct_option: string;
    explanation?: string;
  } | null>(null);
  const [result, setResult] = useState<FinishResult | null>(null);
  const [quizTitle, setQuizTitle] = useState("");
  const [totalQ, setTotalQ] = useState(0);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [error, setError] = useState("");

  // Timer
  const [timeLeft, setTimeLeft] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Rapid guess cooldown
  const cooldownAnim = useRef(new Animated.Value(0)).current;
  const [cooldownSec, setCooldownSec] = useState(0);

  // Ref for handleFinish to avoid stale closures in timer
  const handleFinishRef = useRef<((sid?: string) => Promise<void>) | undefined>(undefined);

  /* ─── Load assignment info ─────────────────────────────── */

  useEffect(() => {
    if (!assignmentId) return;
    (async () => {
      try {
        const data = await quizGet("assignments", { student: studentId || "", year: "25-26" });
        const a = (data.assignments || []).find(
          (x: any) => x.id === assignmentId
        );
        if (a) {
          setQuizTitle(a.title || "Quiz");
          setTotalQ(a.question_ids?.length || 0);
          setTimeLeft((a.duration_minutes || 40) * 60);
        }
        setPhase("info");
      } catch (e: any) {
        setError(e.message);
        setPhase("info");
      }
    })();
  }, [assignmentId, studentId]);

  /* ─── Timer tick ───────────────────────────────────────── */

  useEffect(() => {
    if (phase === "question" && timeLeft > 0) {
      timerRef.current = setInterval(() => {
        setTimeLeft((t) => {
          if (t <= 1) {
            clearInterval(timerRef.current!);
            handleFinishRef.current?.();
            return 0;
          }
          return t - 1;
        });
      }, 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }
  }, [phase]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  /* ─── Start quiz ──────────────────────────────────────── */

  const handleStart = async () => {
    setPhase("loading");
    try {
      const data = await quizApi("session", {
        action: "start",
        assignment_id: assignmentId,
        student_id: studentId,
        student_name: studentName || studentId,
      });
      setSessionId(data.session_id);
      await fetchNext(data.session_id);
    } catch (e: any) {
      setError(e.message);
      setPhase("info");
    }
  };

  /* ─── Fetch next question ─────────────────────────────── */

  const fetchNext = async (sid: string) => {
    try {
      const data = await quizApi("session", {
        action: "next",
        session_id: sid,
      });
      if (data.finished) {
        await handleFinish(sid);
        return;
      }
      setQuestion(data.question);
      setAnsweredCount(data.question.question_number - 1);
      setSelected(null);
      setFeedback(null);
      setPhase("question");
    } catch (e: any) {
      setError(e.message);
    }
  };

  /* ─── Submit answer ───────────────────────────────────── */

  const handleAnswer = async () => {
    if (!selected || !sessionId || !question) return;
    setPhase("loading");
    try {
      const data = await quizApi("session", {
        action: "answer",
        session_id: sessionId,
        question_id: question.id,
        selected_option: selected,
      });

      // Check for rapid guess cooldown
      if (data.rapid_guess_warning) {
        startCooldown();
        return;
      }

      setFeedback({
        correct: data.correct,
        correct_option: data.correct_option,
        explanation: data.explanation,
      });
      setAnsweredCount((c) => c + 1);
      setPhase("feedback");
    } catch (e: any) {
      setError(e.message);
      setPhase("question");
    }
  };

  /* ─── Rapid guess cooldown ────────────────────────────── */

  const startCooldown = () => {
    setPhase("cooldown");
    setCooldownSec(20);
    cooldownAnim.setValue(0);
    Animated.timing(cooldownAnim, {
      toValue: 1,
      duration: 20000,
      useNativeDriver: false,
    }).start(() => {
      setPhase("question");
    });

    const interval = setInterval(() => {
      setCooldownSec((s) => {
        if (s <= 1) { clearInterval(interval); return 0; }
        return s - 1;
      });
    }, 1000);
  };

  /* ─── Next after feedback ─────────────────────────────── */

  const handleNext = () => {
    if (sessionId) fetchNext(sessionId);
  };

  /* ─── Finish ──────────────────────────────────────────── */

  const handleFinish = async (sid?: string) => {
    const id = sid || sessionId;
    if (!id) return;
    if (timerRef.current) clearInterval(timerRef.current);
    try {
      const data = await quizApi("session", {
        action: "finish",
        session_id: id,
      });
      setResult(data.result);
      setPhase("finished");
    } catch (e: any) {
      setError(e.message);
    }
  };

  // Keep ref in sync so the timer interval always calls the latest handleFinish
  handleFinishRef.current = handleFinish;

  /* ─── Mastery helpers ─────────────────────────────────── */

  const masteryEmoji = (m: string) => {
    switch (m) {
      case "excellent": return "🏆";
      case "proficient": return "🎯";
      case "developing": return "📈";
      default: return "💪";
    }
  };

  const masteryColor = (m: string) => {
    switch (m) {
      case "excellent": return colors.success;
      case "proficient": return colors.primary;
      case "developing": return colors.warning;
      default: return colors.danger;
    }
  };

  /* ─── Render ──────────────────────────────────────────── */

  return (
    <SafeAreaView style={commonStyles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => {
          if (phase === "question") {
            Alert.alert("Leave Quiz?", "Your progress will be saved. You can resume later.", [
              { text: "Stay", style: "cancel" },
              { text: "Leave", style: "destructive", onPress: async () => {
                if (sessionId) await quizApi("session", { action: "pause", session_id: sessionId }).catch(() => {});
                router.back();
              }},
            ]);
          } else {
            router.back();
          }
        }}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{quizTitle || "Quiz"}</Text>
        {phase === "question" && (
          <View style={styles.timerBadge}>
            <Ionicons name="time-outline" size={14} color={timeLeft < 60 ? colors.danger : colors.textMuted} />
            <Text style={[styles.timerText, timeLeft < 60 && { color: colors.danger }]}>
              {formatTime(timeLeft)}
            </Text>
          </View>
        )}
      </View>

      {/* Progress bar */}
      {(phase === "question" || phase === "feedback") && totalQ > 0 && (
        <View style={styles.progressContainer}>
          <View style={[styles.progressBar, { width: `${(answeredCount / totalQ) * 100}%` }]} />
          <Text style={styles.progressText}>{answeredCount}/{totalQ}</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content}>
        {/* Error */}
        {error ? (
          <View style={styles.errBox}>
            <Ionicons name="alert-circle" size={20} color={colors.danger} />
            <Text style={styles.errText}>{error}</Text>
          </View>
        ) : null}

        {/* ─── Loading ─────────────────────────────────── */}
        {phase === "loading" && (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Loading…</Text>
          </View>
        )}

        {/* ─── Info / Start ────────────────────────────── */}
        {phase === "info" && (
          <View style={styles.infoCard}>
            <Ionicons name="clipboard-outline" size={48} color={colors.primary} />
            <Text style={styles.infoTitle}>{quizTitle}</Text>
            <Text style={styles.infoSub}>{totalQ} questions • Adaptive difficulty</Text>
            <Text style={styles.infoDesc}>
              Questions will adjust to your level. Take your time — rushing will trigger a cooldown pause.
            </Text>
            <TouchableOpacity style={styles.startBtn} onPress={handleStart} activeOpacity={0.7}>
              <Ionicons name="play" size={20} color={colors.white} />
              <Text style={styles.startBtnText}>Start Quiz</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ─── Question ────────────────────────────────── */}
        {phase === "question" && question && (
          <View>
            <View style={styles.diffBadge}>
              <Text style={styles.diffText}>Level {question.difficulty}</Text>
            </View>

            <Text style={styles.questionText}>{question.text}</Text>
            {question.text_ar ? (
              <Text style={styles.questionTextAr}>{question.text_ar}</Text>
            ) : null}

            <View style={styles.options}>
              {question.options.map((opt) => (
                <TouchableOpacity
                  key={opt.label}
                  style={[
                    styles.optionBtn,
                    selected === opt.label && styles.optionSelected,
                  ]}
                  onPress={() => setSelected(opt.label)}
                  activeOpacity={0.7}
                >
                  <View style={[
                    styles.optionLetter,
                    selected === opt.label && styles.optionLetterSelected,
                  ]}>
                    <Text style={[
                      styles.optionLetterText,
                      selected === opt.label && { color: colors.white },
                    ]}>{opt.label}</Text>
                  </View>
                  <Text style={styles.optionText}>{opt.text}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.submitBtn, !selected && styles.submitBtnDisabled]}
              onPress={handleAnswer}
              disabled={!selected}
              activeOpacity={0.7}
            >
              <Text style={styles.submitBtnText}>Submit Answer</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ─── Feedback ────────────────────────────────── */}
        {phase === "feedback" && feedback && (
          <View style={styles.feedbackCard}>
            <Ionicons
              name={feedback.correct ? "checkmark-circle" : "close-circle"}
              size={56}
              color={feedback.correct ? colors.success : colors.danger}
            />
            <Text style={[styles.feedbackTitle, { color: feedback.correct ? colors.success : colors.danger }]}>
              {feedback.correct ? "Correct!" : "Incorrect"}
            </Text>
            {!feedback.correct && (
              <Text style={styles.feedbackCorrect}>
                Correct answer: {feedback.correct_option}
              </Text>
            )}
            {feedback.explanation ? (
              <Text style={styles.feedbackExplanation}>{feedback.explanation}</Text>
            ) : null}
            <TouchableOpacity style={styles.nextBtn} onPress={handleNext} activeOpacity={0.7}>
              <Text style={styles.nextBtnText}>Next Question</Text>
              <Ionicons name="arrow-forward" size={18} color={colors.white} />
            </TouchableOpacity>
          </View>
        )}

        {/* ─── Cooldown (rapid guessing) ───────────────── */}
        {phase === "cooldown" && (
          <View style={styles.cooldownCard}>
            <Ionicons name="pause-circle" size={56} color={colors.warning} />
            <Text style={styles.cooldownTitle}>Slow Down</Text>
            <Text style={styles.cooldownSub}>
              You&apos;re answering too quickly. Take a moment to think carefully.
            </Text>
            <Animated.View style={[
              styles.cooldownBar,
              { width: cooldownAnim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) },
            ]} />
            <Text style={styles.cooldownTimer}>{cooldownSec}s</Text>
          </View>
        )}

        {/* ─── Finished ────────────────────────────────── */}
        {phase === "finished" && result && (
          <View style={styles.resultCard}>
            <Text style={styles.resultEmoji}>{masteryEmoji(result.mastery)}</Text>
            <Text style={styles.resultTitle}>Quiz Complete!</Text>

            <View style={styles.scoreCircle}>
              <Text style={styles.scoreNum}>{result.percentage}%</Text>
              <Text style={styles.scoreLabel}>{result.score}/{result.total}</Text>
            </View>

            <View style={[styles.masteryBadge, { backgroundColor: masteryColor(result.mastery) }]}>
              <Text style={styles.masteryText}>
                {result.mastery?.replace("_", " ").toUpperCase()}
              </Text>
            </View>

            <View style={styles.statsRow}>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>
                  {Math.floor(result.time_spent_seconds / 60)}m {result.time_spent_seconds % 60}s
                </Text>
                <Text style={styles.statLabel}>Time</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statValue}>{result.estimated_ability?.toFixed(1)}</Text>
                <Text style={styles.statLabel}>Ability</Text>
              </View>
            </View>

            {/* Difficulty breakdown */}
            {result.difficulty_breakdown && (
              <View style={styles.breakdownCard}>
                <Text style={styles.breakdownTitle}>By Difficulty</Text>
                {Object.entries(result.difficulty_breakdown)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([d, v]) => (
                    <View key={d} style={styles.breakdownRow}>
                      <Text style={styles.breakdownLabel}>Level {d}</Text>
                      <View style={styles.breakdownBarBg}>
                        <View
                          style={[
                            styles.breakdownBarFill,
                            { width: `${(v.correct / Math.max(v.total, 1)) * 100}%` },
                          ]}
                        />
                      </View>
                      <Text style={styles.breakdownVal}>{v.correct}/{v.total}</Text>
                    </View>
                  ))}
              </View>
            )}

            <TouchableOpacity style={styles.doneBtn} onPress={() => router.back()} activeOpacity={0.7}>
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ─── Styles ────────────────────────────────────────────── */

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  headerTitle: {
    flex: 1,
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: colors.text,
  },
  timerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  timerText: {
    fontSize: fontSize.sm,
    fontWeight: "600",
    color: colors.textMuted,
  },
  progressContainer: {
    height: 24,
    backgroundColor: colors.surfaceLight,
    flexDirection: "row",
    alignItems: "center",
  },
  progressBar: {
    height: "100%",
    backgroundColor: colors.primary,
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  progressText: {
    position: "absolute",
    right: spacing.sm,
    fontSize: fontSize.xs,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
  },
  loadingText: {
    marginTop: spacing.md,
    color: colors.textMuted,
    fontSize: fontSize.base,
  },
  errBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: "#1e0505",
    padding: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  errText: {
    color: colors.danger,
    fontSize: fontSize.sm,
    flex: 1,
  },

  // Info
  infoCard: {
    alignItems: "center",
    paddingTop: 40,
    gap: spacing.md,
  },
  infoTitle: {
    fontSize: fontSize["2xl"],
    fontWeight: "700",
    color: colors.text,
    textAlign: "center",
  },
  infoSub: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
  },
  infoDesc: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: spacing.lg,
  },
  startBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  startBtnText: {
    color: colors.white,
    fontSize: fontSize.lg,
    fontWeight: "700",
  },

  // Question
  diffBadge: {
    alignSelf: "flex-start",
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    marginBottom: spacing.md,
  },
  diffText: {
    fontSize: fontSize.xs,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  questionText: {
    fontSize: fontSize.lg,
    fontWeight: "600",
    color: colors.text,
    lineHeight: 28,
    marginBottom: spacing.sm,
  },
  questionTextAr: {
    fontSize: fontSize.lg,
    fontWeight: "500",
    color: colors.textSecondary,
    textAlign: "right",
    lineHeight: 28,
    marginBottom: spacing.lg,
  },
  options: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  optionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
  },
  optionSelected: {
    borderColor: colors.primary,
    backgroundColor: "rgba(37,99,235,0.1)",
  },
  optionLetter: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
  },
  optionLetterSelected: {
    backgroundColor: colors.primary,
  },
  optionLetterText: {
    fontSize: fontSize.base,
    fontWeight: "700",
    color: colors.textSecondary,
  },
  optionText: {
    flex: 1,
    fontSize: fontSize.base,
    color: colors.text,
    lineHeight: 22,
  },
  submitBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    alignItems: "center",
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    color: colors.white,
    fontSize: fontSize.base,
    fontWeight: "700",
  },

  // Feedback
  feedbackCard: {
    alignItems: "center",
    paddingTop: 40,
    gap: spacing.md,
  },
  feedbackTitle: {
    fontSize: fontSize["2xl"],
    fontWeight: "700",
  },
  feedbackCorrect: {
    fontSize: fontSize.base,
    color: colors.textSecondary,
  },
  feedbackExplanation: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
    backgroundColor: colors.surfaceLight,
    padding: spacing.md,
    borderRadius: radius.md,
  },
  nextBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  nextBtnText: {
    color: colors.white,
    fontSize: fontSize.base,
    fontWeight: "700",
  },

  // Cooldown
  cooldownCard: {
    alignItems: "center",
    paddingTop: 60,
    gap: spacing.md,
  },
  cooldownTitle: {
    fontSize: fontSize["2xl"],
    fontWeight: "700",
    color: colors.warning,
  },
  cooldownSub: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: spacing.lg,
  },
  cooldownBar: {
    height: 6,
    backgroundColor: colors.warning,
    borderRadius: 3,
    alignSelf: "stretch",
    marginTop: spacing.md,
  },
  cooldownTimer: {
    fontSize: fontSize["3xl"],
    fontWeight: "700",
    color: colors.warning,
  },

  // Result
  resultCard: {
    alignItems: "center",
    paddingTop: 20,
    gap: spacing.md,
  },
  resultEmoji: {
    fontSize: 48,
  },
  resultTitle: {
    fontSize: fontSize["2xl"],
    fontWeight: "700",
    color: colors.text,
  },
  scoreCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: colors.primary,
  },
  scoreNum: {
    fontSize: fontSize["3xl"],
    fontWeight: "700",
    color: colors.primary,
  },
  scoreLabel: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  masteryBadge: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  masteryText: {
    color: colors.white,
    fontWeight: "700",
    fontSize: fontSize.sm,
  },
  statsRow: {
    flexDirection: "row",
    gap: spacing.lg,
  },
  statBox: {
    alignItems: "center",
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    minWidth: 100,
  },
  statValue: {
    fontSize: fontSize.lg,
    fontWeight: "700",
    color: colors.text,
  },
  statLabel: {
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 2,
  },
  breakdownCard: {
    alignSelf: "stretch",
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  breakdownTitle: {
    fontSize: fontSize.base,
    fontWeight: "600",
    color: colors.text,
    marginBottom: spacing.xs,
  },
  breakdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  breakdownLabel: {
    width: 60,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
  },
  breakdownBarBg: {
    flex: 1,
    height: 8,
    backgroundColor: colors.surfaceLight,
    borderRadius: 4,
    overflow: "hidden",
  },
  breakdownBarFill: {
    height: "100%",
    backgroundColor: colors.primary,
    borderRadius: 4,
  },
  breakdownVal: {
    width: 36,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    textAlign: "right",
  },
  doneBtn: {
    backgroundColor: colors.success,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    marginTop: spacing.md,
  },
  doneBtnText: {
    color: colors.white,
    fontSize: fontSize.base,
    fontWeight: "700",
  },
});
