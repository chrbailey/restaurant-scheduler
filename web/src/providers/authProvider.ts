import { AuthProvider } from "@refinedev/core";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api/v1";

const api = axios.create({
  baseURL: API_URL,
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("accessToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authProvider: AuthProvider = {
  login: async ({ email, password }) => {
    try {
      const response = await api.post("/auth/login", { email, password });
      const { accessToken, refreshToken, user, profiles } = response.data;

      localStorage.setItem("accessToken", accessToken);
      localStorage.setItem("refreshToken", refreshToken);
      localStorage.setItem("user", JSON.stringify(user));
      localStorage.setItem("profiles", JSON.stringify(profiles));

      // Set first restaurant as active if available
      if (profiles && profiles.length > 0) {
        localStorage.setItem("activeRestaurantId", profiles[0].restaurantId);
        localStorage.setItem("activeProfile", JSON.stringify(profiles[0]));
      }

      return {
        success: true,
        redirectTo: "/dashboard",
      };
    } catch (error: any) {
      return {
        success: false,
        error: {
          name: "LoginError",
          message: error.response?.data?.message || "Invalid credentials",
        },
      };
    }
  },

  logout: async () => {
    const refreshToken = localStorage.getItem("refreshToken");

    try {
      if (refreshToken) {
        await api.post("/auth/logout", { refreshToken });
      }
    } catch (error) {
      console.error("Logout error:", error);
    }

    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("user");
    localStorage.removeItem("profiles");
    localStorage.removeItem("activeRestaurantId");
    localStorage.removeItem("activeProfile");

    return {
      success: true,
      redirectTo: "/login",
    };
  },

  check: async () => {
    const token = localStorage.getItem("accessToken");

    if (token) {
      return {
        authenticated: true,
      };
    }

    return {
      authenticated: false,
      redirectTo: "/login",
    };
  },

  getPermissions: async () => {
    const profile = localStorage.getItem("activeProfile");
    if (profile) {
      const parsed = JSON.parse(profile);
      return parsed.role;
    }
    return null;
  },

  getIdentity: async () => {
    const user = localStorage.getItem("user");
    const profile = localStorage.getItem("activeProfile");

    if (user) {
      const parsedUser = JSON.parse(user);
      const parsedProfile = profile ? JSON.parse(profile) : null;

      return {
        id: parsedUser.id,
        name: `${parsedUser.firstName} ${parsedUser.lastName}`,
        email: parsedUser.email,
        avatar: undefined,
        role: parsedProfile?.role,
        restaurantId: parsedProfile?.restaurantId,
        restaurantName: parsedProfile?.restaurantName,
      };
    }

    return null;
  },

  onError: async (error) => {
    if (error.response?.status === 401) {
      // Try to refresh token
      const refreshToken = localStorage.getItem("refreshToken");

      if (refreshToken) {
        try {
          const response = await api.post("/auth/refresh", { refreshToken });
          const { accessToken, refreshToken: newRefreshToken } = response.data;

          localStorage.setItem("accessToken", accessToken);
          localStorage.setItem("refreshToken", newRefreshToken);

          return { error };
        } catch {
          // Refresh failed, logout
          return {
            logout: true,
            redirectTo: "/login",
            error,
          };
        }
      }

      return {
        logout: true,
        redirectTo: "/login",
        error,
      };
    }

    return { error };
  },
};
