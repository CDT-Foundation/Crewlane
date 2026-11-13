import { describe, expect, it } from "vitest";
import { classifyHost, isValidCustomDomain, isValidSlug } from "@/lib/hosts";

describe("classifyHost", () => {
  it("recognises the root domain with and without www or port", () => {
    expect(classifyHost("crewlane.app", "crewlane.app")).toEqual({ kind: "root" });
    expect(classifyHost("www.crewlane.app", "crewlane.app")).toEqual({ kind: "root" });
    expect(classifyHost("localhost:3000", "localhost:3000")).toEqual({ kind: "root" });
  });

  it("maps a subdomain to a tenant slug", () => {
    expect(classifyHost("acme.crewlane.app", "crewlane.app")).toEqual({ kind: "subdomain", slug: "acme" });
    expect(classifyHost("ACME.localhost:3000", "localhost:3000")).toEqual({ kind: "subdomain", slug: "acme" });
  });

  it("does not treat nested subdomains or look-alikes as tenants", () => {
    expect(classifyHost("a.b.crewlane.app", "crewlane.app").kind).toBe("custom");
    expect(classifyHost("acme.crewlane.app.evil.com", "crewlane.app").kind).toBe("custom");
    expect(classifyHost("evilcrewlane.app", "crewlane.app").kind).toBe("custom");
  });

  it("treats everything else as a custom domain", () => {
    expect(classifyHost("hr.acme.com", "crewlane.app")).toEqual({ kind: "custom", domain: "hr.acme.com" });
  });
});

describe("slugs and domains", () => {
  it("validates slugs and blocks reserved words", () => {
    expect(isValidSlug("acme-lanka")).toBe(true);
    expect(isValidSlug("ab")).toBe(false);
    expect(isValidSlug("-acme")).toBe(false);
    expect(isValidSlug("acme--x")).toBe(false);
    expect(isValidSlug("www")).toBe(false);
    expect(isValidSlug("admin")).toBe(false);
  });

  it("validates custom domains", () => {
    expect(isValidCustomDomain("hr.acme.com")).toBe(true);
    expect(isValidCustomDomain("localhost")).toBe(false);
    expect(isValidCustomDomain("acme")).toBe(false);
  });
});
