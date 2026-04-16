import { describe, it, expect, vi, beforeEach } from "vitest";

type BalanceRecord = { userId: string; totalPurchased: number };
let balances: Map<string, BalanceRecord>;

function resetStore() {
  balances = new Map();
}

function seedBalance(userId: string, totalPurchased: number) {
  balances.set(userId, { userId, totalPurchased });
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    userCreditBalance: {
      findUnique: vi.fn(async ({ where }: { where: { userId: string } }) => {
        return balances.get(where.userId) ?? null;
      }),
    },
  },
}));

const {
  canAccessFeature,
  assertFeatureAccess,
  FeatureAccessError,
  serializeFeatureAccessError,
} = await import("../feature-access");

describe("canAccessFeature", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it("refuse un user sans solde pour api et negotiation", async () => {
    const api = await canAccessFeature("u_none", "api");
    const neg = await canAccessFeature("u_none", "negotiation");
    expect(api.allowed).toBe(false);
    expect(api.required).toBe(125);
    expect(api.current).toBe(0);
    expect(neg.allowed).toBe(false);
    expect(neg.required).toBe(60);
  });

  it("refuse 59/60 pour negotiation, 124/125 pour api", async () => {
    seedBalance("u_59", 59);
    const neg59 = await canAccessFeature("u_59", "negotiation");
    expect(neg59.allowed).toBe(false);

    seedBalance("u_124", 124);
    const api124 = await canAccessFeature("u_124", "api");
    expect(api124.allowed).toBe(false);
  });

  it("accepte exactement au seuil", async () => {
    seedBalance("u_60", 60);
    const neg = await canAccessFeature("u_60", "negotiation");
    const api = await canAccessFeature("u_60", "api");
    expect(neg.allowed).toBe(true);
    expect(api.allowed).toBe(false);

    seedBalance("u_125", 125);
    const api2 = await canAccessFeature("u_125", "api");
    expect(api2.allowed).toBe(true);
  });

  it("accepte au-dela du seuil", async () => {
    seedBalance("u_300", 300);
    const neg = await canAccessFeature("u_300", "negotiation");
    const api = await canAccessFeature("u_300", "api");
    expect(neg.allowed).toBe(true);
    expect(api.allowed).toBe(true);
  });

  it("rejette une feature inconnue sans crasher", async () => {
    // @ts-expect-error — test d'abstention pour feature non supportee
    const res = await canAccessFeature("u_x", "unknown");
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain("Unknown feature");
  });
});

describe("assertFeatureAccess", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  it("resout silencieusement quand le seuil est atteint", async () => {
    seedBalance("u_ok", 125);
    await expect(assertFeatureAccess("u_ok", "api")).resolves.toBeUndefined();
  });

  it("throw FeatureAccessError sinon, avec feature/required/current typed", async () => {
    seedBalance("u_low", 40);
    try {
      await assertFeatureAccess("u_low", "negotiation");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(FeatureAccessError);
      const fae = err as InstanceType<typeof FeatureAccessError>;
      expect(fae.feature).toBe("negotiation");
      expect(fae.required).toBe(60);
      expect(fae.current).toBe(40);
    }
  });
});

describe("serializeFeatureAccessError", () => {
  it("produit le payload 403 attendu", () => {
    const err = new FeatureAccessError("api", 125, 10);
    const body = serializeFeatureAccessError(err);
    expect(body).toEqual({
      error: "Feature non debloquee",
      feature: "api",
      requiredCredits: 125,
      currentCredits: 10,
    });
  });
});
