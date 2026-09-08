import { afterEach, describe, expect, it, vi } from "vitest";
import { AppleWalletLink } from "@/modules/wallet/components/AppleWalletLink";

afterEach(() => vi.unstubAllGlobals());

describe("destino del enlace Apple al activarlo", () => {
  it.each([
    { name: "Safari normal", displayStandalone: false, iosStandalone: false, target: "_blank" },
    {
      name: "PWA por display-mode",
      displayStandalone: true,
      iosStandalone: false,
      target: "_self",
    },
    {
      name: "PWA por navigator de iOS",
      displayStandalone: false,
      iosStandalone: true,
      target: "_self",
    },
  ])("usa $target en $name", ({ displayStandalone, iosStandalone, target }) => {
    const matchMedia = vi.fn().mockReturnValue({ matches: displayStandalone });
    vi.stubGlobal("window", { matchMedia });
    vi.stubGlobal("navigator", { standalone: iosStandalone });
    const link = AppleWalletLink({ children: "Badge sintético", className: "badge" });
    const currentTarget = { target: link.props.target };
    const preventDefault = vi.fn();

    link.props.onClick({ currentTarget, preventDefault });

    expect(currentTarget.target).toBe(target);
    expect(link.props.href).toBe("/api/wallet/apple");
    expect(link.props.rel).toBe("noopener");
    expect(preventDefault).not.toHaveBeenCalled();
    expect(matchMedia).toHaveBeenCalledWith("(display-mode: standalone)");
  });

  it("vuelve a comprobar el modo al activar de nuevo el mismo enlace", () => {
    const matchMedia = vi
      .fn()
      .mockReturnValueOnce({ matches: true })
      .mockReturnValueOnce({ matches: false });
    vi.stubGlobal("window", { matchMedia });
    vi.stubGlobal("navigator", {});
    const link = AppleWalletLink({ children: "Badge sintético", className: "badge" });
    const currentTarget = { target: link.props.target };

    link.props.onClick({ currentTarget });
    expect(currentTarget.target).toBe("_self");
    link.props.onClick({ currentTarget });
    expect(currentTarget.target).toBe("_blank");
  });
});
