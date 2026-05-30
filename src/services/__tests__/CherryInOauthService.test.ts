import type { ProviderService } from "@/data/services/ProviderService";
import type { AuthConfig } from "@/data/types/provider";
import { CherryInOauthService } from "../CherryInOauthService";
import { Linking, AppState } from "react-native";

// Mock dependencies
jest.mock("@logger", () => ({
    loggerService: {
        withContext: () => ({
            debug: jest.fn(),
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
        }),
    },
}));

// Mock expo-crypto
jest.mock("expo-crypto", () => ({
    getRandomBytesAsync: jest.fn((length: number) => {
        // Return deterministic pseudo-random bytes for testing
        return Promise.resolve(new Uint8Array(length).fill(0x42));
    }),
    digestStringAsync: jest.fn((algorithm: string, input: string) => {
        // Return a deterministic hash for testing (64 hex chars for SHA256)
        return Promise.resolve("a".repeat(64));
    }),
    CryptoDigestAlgorithm: {
        SHA256: "SHA-256",
    },
}));

jest.mock("react-native", () => ({
    AppState: {
        addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    },
    Linking: {
        addEventListener: jest.fn(() => ({ remove: jest.fn() })),
        getInitialURL: jest.fn().mockResolvedValue(null),
        canOpenURL: jest.fn().mockResolvedValue(true),
        openURL: jest.fn().mockResolvedValue(undefined),
    },
}));

jest.mock("@/config/constants", () => ({
    CHERRYIN_CONFIG: {
        CLIENT_ID: "test-client-id",
        ALLOWED_HOSTS: ["https://open.cherryin.ai", "https://open.cherryin.dev"],
        REDIRECT_URI: "cherrystudio://oauth/callback",
        SCOPES: "openid profile email offline_access",
    },
}));

describe("CherryInOauthService", () => {
    let service: CherryInOauthService;
    let mockProviderService: jest.Mocked<ProviderService>;
    let fetchMock: jest.Mock;

    beforeEach(() => {
        jest.useRealTimers();

        // Create a fresh fetch mock for each test
        fetchMock = jest.fn();
        global.fetch = fetchMock;

        // Create mock ProviderService
        mockProviderService = {
            getAuthConfig: jest.fn(),
            update: jest.fn().mockResolvedValue(undefined),
        } as unknown as jest.Mocked<ProviderService>;

        service = new CherryInOauthService();
        service.setProviderService(mockProviderService);
    });

    beforeEach(() => {
        // Clear mocks after creating service to ensure clean state
        jest.clearAllMocks();
    });

    afterEach(() => {
        // Clear any pending promises before destroying to avoid unhandled rejections
        service.deactivate();
    });

    describe("activate/deactivate", () => {
        it("should activate and deactivate correctly", async () => {
            expect(service.isActivated).toBe(false);

            await service.activate();
            expect(service.isActivated).toBe(true);

            service.deactivate();
            expect(service.isActivated).toBe(false);
        });

        it("should not activate twice", async () => {
            await service.activate();
            await service.activate(); // Second call should be no-op
            expect(service.isActivated).toBe(true);
        });
    });

    describe("validateApiHost", () => {
        it("should reject api hosts outside the allowlist (SSRF defense)", async () => {
            const forgedHost = "https://attacker.example.com";

            await expect(service.startOAuthFlow(forgedHost)).rejects.toThrow(
                /Unauthorized API host/
            );

            await expect(service.getBalance(forgedHost)).rejects.toThrow(
                /Unauthorized API host/
            );

            await expect(service.logout(forgedHost)).rejects.toThrow(
                /Unauthorized API host/
            );
        });

        it("should accept allowed hosts", async () => {
            const validHost = "https://open.cherryin.ai";

            // Mock fetch for token exchange
            fetchMock.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    access_token: "test-token",
                    refresh_token: "test-refresh",
                }),
            });

            // Mock API keys fetch
            fetchMock.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ["api-key-1", "api-key-2"],
            });

            // Start OAuth flow should not throw for valid host
            const flowPromise = service.startOAuthFlow(validHost);

            // Wait for the Promise to progress and call Linking methods
            await new Promise((resolve) => setImmediate(resolve));

            // Get the URL handler and opened URL from the mock
            const urlHandler = (Linking.addEventListener as jest.Mock).mock.calls[0][1];
            const openURLCall = (Linking.openURL as jest.Mock).mock.calls[0][0];
            const url = new URL(openURLCall);
            const state = url.searchParams.get("state");

            // Simulate callback
            urlHandler({ url: `cherrystudio://oauth/callback?state=${state}&code=auth-code` });

            await expect(flowPromise).resolves.toBe("api-key-1,api-key-2");
        });
    });

    describe("OAuth flow", () => {
        it("should start OAuth flow and generate PKCE parameters", async () => {
            fetchMock
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async () => ({
                        access_token: "test-access",
                        refresh_token: "test-refresh",
                    }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async () => ["test-api-key"],
                });

            const flowPromise = service.startOAuthFlow("https://open.cherryin.ai");

            // Wait for the Promise to progress and call Linking.openURL
            await new Promise((resolve) => setImmediate(resolve));

            const openedUrl = (Linking.openURL as jest.Mock).mock.calls[0][0];

            // Verify PKCE parameters
            const url = new URL(openedUrl);
            expect(url.searchParams.get("client_id")).toBe("test-client-id");
            expect(url.searchParams.get("response_type")).toBe("code");
            expect(url.searchParams.get("code_challenge_method")).toBe("S256");
            expect(url.searchParams.get("code_challenge")).toBeTruthy();
            expect(url.searchParams.get("state")).toHaveLength(32);

            // Complete the flow
            const state = url.searchParams.get("state");
            const urlHandler = (Linking.addEventListener as jest.Mock).mock.calls[0][1];
            urlHandler({ url: `cherrystudio://oauth/callback?state=${state}&code=auth-code` });

            await expect(flowPromise).resolves.toBe("test-api-key");
        });

        it("should reject OAuth callbacks with missing or unknown state (CSRF defense)", async () => {
            await service.activate();

            // Start a valid flow to get a state
            fetchMock
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async () => ({
                        access_token: "test-access",
                        refresh_token: "test-refresh",
                    }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async () => ["test-api-key"],
                });

            const flowPromise = service.startOAuthFlow("https://open.cherryin.ai");

            // Wait for the Promise to progress and call Linking methods
            await new Promise((resolve) => setImmediate(resolve));

            const openedUrl = (Linking.openURL as jest.Mock).mock.calls[0][0];
            const validState = new URL(openedUrl).searchParams.get("state");

            // Case 1: Missing state - should be silently ignored
            await service.handleOAuthCallback(
                new URL("cherrystudio://oauth/callback?code=auth-code")
            );

            // Case 2: Unknown state - should be silently ignored
            await service.handleOAuthCallback(
                new URL("cherrystudio://oauth/callback?state=attacker-forged-state&code=auth-code")
            );

            // The legitimate flow should still be pending
            const urlHandler = (Linking.addEventListener as jest.Mock).mock.calls[0][1];
            urlHandler({ url: `cherrystudio://oauth/callback?state=${validState}&code=auth-code` });

            await expect(flowPromise).resolves.toBe("test-api-key");
        });

        it("should handle OAuth provider errors", async () => {
            const flowPromise = service.startOAuthFlow("https://open.cherryin.ai");

            // Wait for the Promise to progress and call Linking methods
            await new Promise((resolve) => setImmediate(resolve));

            const openedUrl = (Linking.openURL as jest.Mock).mock.calls[0][0];
            const state = new URL(openedUrl).searchParams.get("state");

            const urlHandler = (Linking.addEventListener as jest.Mock).mock.calls[0][1];
            urlHandler({
                url: `cherrystudio://oauth/callback?state=${state}&error=access_denied&error_description=User+denied+access`,
            });

            await expect(flowPromise).rejects.toThrow("User denied access");
        });

        it("should not persist OAuth token when the api-keys fetch fails after token exchange", async () => {
            fetchMock
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async () => ({
                        access_token: "leaked-access",
                        refresh_token: "leaked-refresh",
                    }),
                })
                .mockResolvedValueOnce({
                    ok: false,
                    status: 500,
                    statusText: "Internal Server Error",
                    text: async () => "upstream down",
                });

            const flowPromise = service.startOAuthFlow("https://open.cherryin.ai");

            // Wait for the Promise to progress and call Linking methods
            await new Promise((resolve) => setImmediate(resolve));

            const openedUrl = (Linking.openURL as jest.Mock).mock.calls[0][0];
            const state = new URL(openedUrl).searchParams.get("state");

            const urlHandler = (Linking.addEventListener as jest.Mock).mock.calls[0][1];
            urlHandler({ url: `cherrystudio://oauth/callback?state=${state}&code=auth-code` });

            await expect(flowPromise).rejects.toThrow();

            // Verify no OAuth config was saved
            const oauthUpdateCalls = (mockProviderService.update as jest.Mock).mock.calls.filter(
                (call) => {
                    const dto = call[1] as { authConfig?: { type?: string } } | undefined;
                    return dto?.authConfig?.type === "oauth";
                }
            );
            expect(oauthUpdateCalls).toEqual([]);
        });
    });

    describe("token management", () => {
        it("should save tokens into provider auth config and preserve the prior refresh token when none is returned", async () => {
            mockProviderService.getAuthConfig.mockResolvedValue({
                type: "oauth",
                clientId: "existing-client",
                accessToken: "old-access",
                refreshToken: "old-refresh",
            } as AuthConfig);

            await service.saveToken("new-access");

            expect(mockProviderService.update).toHaveBeenCalledWith("cherryin", {
                authConfig: {
                    type: "oauth",
                    clientId: "existing-client",
                    accessToken: "new-access",
                    refreshToken: "old-refresh",
                },
            });
        });

        it("should save tokens with new refresh token when provided", async () => {
            mockProviderService.getAuthConfig.mockResolvedValue({
                type: "oauth",
                clientId: "existing-client",
                accessToken: "old-access",
                refreshToken: "old-refresh",
            } as AuthConfig);

            await service.saveToken("new-access", "new-refresh");

            expect(mockProviderService.update).toHaveBeenCalledWith("cherryin", {
                authConfig: {
                    type: "oauth",
                    clientId: "existing-client",
                    accessToken: "new-access",
                    refreshToken: "new-refresh",
                },
            });
        });

        it("should fail token saves without overwriting auth config when the current auth config cannot be read", async () => {
            mockProviderService.getAuthConfig.mockRejectedValue(new Error("sqlite busy"));

            await expect(service.saveToken("new-access")).rejects.toThrow(
                "Failed to save OAuth token"
            );

            expect(mockProviderService.update).not.toHaveBeenCalled();
        });

        it("should read the access token from provider auth config", async () => {
            mockProviderService.getAuthConfig.mockResolvedValue({
                type: "oauth",
                clientId: "client-id",
                accessToken: "oauth-access",
                refreshToken: "oauth-refresh",
            } as AuthConfig);

            await expect(service.getToken()).resolves.toBe("oauth-access");
        });

        it("should return null when no OAuth token exists", async () => {
            mockProviderService.getAuthConfig.mockResolvedValue({
                type: "api-key",
            } as AuthConfig);

            await expect(service.getToken()).resolves.toBeNull();
        });

        it("should check if OAuth token exists", async () => {
            mockProviderService.getAuthConfig.mockResolvedValue({
                type: "oauth",
                accessToken: "oauth-access",
            } as AuthConfig);

            await expect(service.hasToken()).resolves.toBe(true);
        });
    });

    describe("getBalance", () => {
        it("should map balance/profile data correctly", async () => {
            mockProviderService.getAuthConfig.mockResolvedValue({
                type: "oauth",
                clientId: "client-id",
                accessToken: "oauth-access",
                refreshToken: "oauth-refresh",
            } as AuthConfig);

            fetchMock
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async () => ({
                        success: true,
                        data: {
                            quota: 64250000,
                            used_quota: 3410000,
                        },
                    }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async () => ({
                        data: {
                            display_name: "Siin",
                            username: "siin",
                            email: "siin@gmail.com",
                            group: "Pro",
                        },
                    }),
                });

            const result = await service.getBalance("https://open.cherryin.ai");

            expect(result).toEqual({
                balance: 128.5, // 64250000 / 500000
                profile: {
                    displayName: "Siin",
                    username: "siin",
                    email: "siin@gmail.com",
                    group: "Pro",
                },
                monthlyUsageTokens: null,
                monthlySpend: 6.82, // 3410000 / 500000
            });
        });

        it("should map flat profile responses without treating them as missing wrapped data", async () => {
            mockProviderService.getAuthConfig.mockResolvedValue({
                type: "oauth",
                clientId: "client-id",
                accessToken: "oauth-access",
                refreshToken: "oauth-refresh",
            } as AuthConfig);

            fetchMock
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async () => ({
                        success: true,
                        data: {
                            quota: 1000,
                            used_quota: 0,
                        },
                    }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async () => ({
                        display_name: "Flat User",
                        username: "flat",
                        email: "flat@example.com",
                        group: "Team",
                    }),
                });

            const result = await service.getBalance("https://open.cherryin.ai");

            expect(result.profile).toEqual({
                displayName: "Flat User",
                username: "flat",
                email: "flat@example.com",
                group: "Team",
            });
        });

        it("should expose balance API HTTP failures in the thrown error message", async () => {
            mockProviderService.getAuthConfig.mockResolvedValue({
                type: "oauth",
                clientId: "client-id",
                accessToken: "oauth-access",
            } as AuthConfig);

            fetchMock.mockResolvedValue({
                ok: false,
                status: 500,
                statusText: "Internal Server Error",
            });

            await expect(
                service.getBalance("https://open.cherryin.ai")
            ).rejects.toThrow("Failed to get balance: HTTP 500 Internal Server Error from /api/v1/oauth/balance");
        });

        it("should clear the OAuth session and throw OAuthSessionExpired when 401 hits with no refresh token", async () => {
            mockProviderService.getAuthConfig.mockResolvedValue({
                type: "oauth",
                clientId: "client-id",
                accessToken: "oauth-access",
            } as AuthConfig);

            fetchMock.mockResolvedValue({
                ok: false,
                status: 401,
                statusText: "Unauthorized",
            });

            await expect(
                service.getBalance("https://open.cherryin.ai")
            ).rejects.toThrow("OAuth session expired: no refresh token available");

            expect(mockProviderService.update).toHaveBeenCalledWith("cherryin", {
                authConfig: { type: "api-key" },
            });
        });

        it("should deduplicate concurrent token refreshes after simultaneous unauthorized responses", async () => {
            mockProviderService.getAuthConfig.mockResolvedValue({
                type: "oauth",
                clientId: "client-id",
                accessToken: "expired-access",
                refreshToken: "refresh-token",
            } as AuthConfig);

            let releaseRefresh: (() => void) | null = null;
            const refreshGate = new Promise<void>((resolve) => {
                releaseRefresh = resolve;
            });

            fetchMock.mockImplementation(async (url: string | URL, init?: RequestInit) => {
                const urlString = String(url);

                if (urlString.endsWith("/oauth2/token")) {
                    await refreshGate;
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({
                            access_token: "fresh-access",
                            refresh_token: "fresh-refresh",
                        }),
                    };
                }

                const headers = init?.headers as Record<string, string> | undefined;
                const authorization = headers?.Authorization;

                if (authorization === "Bearer fresh-access") {
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({
                            success: true,
                            data: {
                                quota: 100,
                                used_quota: 0,
                            },
                        }),
                    };
                }

                return {
                    ok: false,
                    status: 401,
                    statusText: "Unauthorized",
                    clone: () => ({
                        text: async () => "{}",
                    }),
                };
            });

            const first = service.getBalance("https://open.cherryin.ai");
            const second = service.getBalance("https://open.cherryin.ai");

            // Wait for both requests to hit the 401 and trigger refresh
            await new Promise((resolve) => setTimeout(resolve, 10));

            // Only one token refresh should be in flight
            const tokenCalls = fetchMock.mock.calls.filter(([url]: [string | URL]) =>
                String(url).endsWith("/oauth2/token")
            );
            expect(tokenCalls.length).toBeLessThanOrEqual(1);

            releaseRefresh!();

            // Profile is null because the user profile endpoint returns 401 and then null
            await expect(Promise.all([first, second])).resolves.toEqual([
                {
                    balance: 0.0002,
                    profile: {
                        displayName: null,
                        username: null,
                        email: null,
                        group: null,
                    },
                    monthlyUsageTokens: null,
                    monthlySpend: 0,
                },
                {
                    balance: 0.0002,
                    profile: {
                        displayName: null,
                        username: null,
                        email: null,
                        group: null,
                    },
                    monthlyUsageTokens: null,
                    monthlySpend: 0,
                },
            ]);
        });
    });

    describe("logout", () => {
        it("should clear auth config back to api-key mode on logout", async () => {
            mockProviderService.getAuthConfig.mockResolvedValue({
                type: "oauth",
                clientId: "client-id",
                accessToken: "oauth-access",
                refreshToken: "oauth-refresh",
            } as AuthConfig);

            fetchMock.mockResolvedValue({
                ok: true,
                status: 200,
            });

            await service.logout("https://open.cherryin.ai");

            expect(mockProviderService.update).toHaveBeenCalledWith("cherryin", {
                authConfig: {
                    type: "api-key",
                },
            });
        });

        it("should revoke token on server before clearing local config", async () => {
            mockProviderService.getAuthConfig.mockResolvedValue({
                type: "oauth",
                accessToken: "oauth-access",
            } as AuthConfig);

            fetchMock.mockResolvedValue({
                ok: true,
                status: 200,
            });

            await service.logout("https://open.cherryin.ai");

            expect(fetchMock).toHaveBeenCalledWith(
                "https://open.cherryin.ai/oauth2/revoke",
                expect.objectContaining({
                    method: "POST",
                    body: expect.stringContaining("oauth-access"),
                })
            );
        });
    });

    describe("cleanup", () => {
        it("should clean up abandoned OAuth flows on the timer", async () => {
            jest.useFakeTimers();
            await service.activate();

            // Start a flow but don't complete it
            fetchMock
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async () => ({
                        access_token: "test-token",
                        refresh_token: "test-refresh",
                    }),
                })
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: async () => ["test-api-key"],
                });

            const flowPromise = service.startOAuthFlow("https://open.cherryin.ai");

            // Wait for the Promise to progress and activate the service
            // Use runAllTicks to execute setImmediate callbacks in fake timers mode
            await jest.advanceTimersByTimeAsync(0);

            expect(service.isActivated).toBe(true);

            // Advance time past the 10 minute TTL + 1 minute cleanup interval
            await jest.advanceTimersByTimeAsync(11 * 60 * 1000);

            expect(service.isActivated).toBe(false);

            jest.useRealTimers();
        });
    });

    describe("redactDiagnosticValue", () => {
        it("should redact sensitive values in diagnostic logs", () => {
            // Access private method for testing
            const redact = (service as any).redactDiagnosticValue.bind(service);

            expect(
                redact("grant_type=refresh_token&refresh_token=refresh-secret&access_token=access-secret&code=auth-code")
            ).toBe("grant_type=refresh_token&refresh_token=<redacted>&access_token=<redacted>&code=<redacted>");

            expect(
                redact({
                    data: ["Bearer live-token", "client_secret=client-secret"],
                    nested: { refresh_token: "refresh-secret" },
                })
            ).toEqual({
                data: ["Bearer <redacted>", "client_secret=<redacted>"],
                nested: { refresh_token: "<redacted>" },
            });
        });
    });
});
