import { DataProvider } from "@refinedev/core";
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api/v1";

// Create axios instance
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

// Get restaurant ID from context
const getRestaurantId = (): string => {
  return localStorage.getItem("activeRestaurantId") || "";
};

export const dataProvider: DataProvider = {
  getList: async ({ resource, pagination, filters, sorters }) => {
    const { current = 1, pageSize = 10 } = pagination || {};
    const restaurantId = getRestaurantId();

    const params: any = {
      page: current,
      pageSize,
    };

    // Add filters
    filters?.forEach((filter) => {
      if ("field" in filter) {
        params[filter.field] = filter.value;
      }
    });

    // Add sorters
    if (sorters && sorters.length > 0) {
      params.sortBy = sorters[0].field;
      params.sortOrder = sorters[0].order;
    }

    const url =
      resource === "dashboard" || resource === "settings"
        ? `/${resource}`
        : `/restaurants/${restaurantId}/${resource}`;

    const { data } = await api.get(url, { params });

    return {
      data: data.data || data,
      total: data.meta?.total || data.length || 0,
    };
  },

  getOne: async ({ resource, id }) => {
    const restaurantId = getRestaurantId();
    const url = `/restaurants/${restaurantId}/${resource}/${id}`;
    const { data } = await api.get(url);
    return { data };
  },

  create: async ({ resource, variables }) => {
    const restaurantId = getRestaurantId();
    const url = `/restaurants/${restaurantId}/${resource}`;
    const { data } = await api.post(url, variables);
    return { data };
  },

  update: async ({ resource, id, variables }) => {
    const restaurantId = getRestaurantId();
    const url = `/restaurants/${restaurantId}/${resource}/${id}`;
    const { data } = await api.put(url, variables);
    return { data };
  },

  deleteOne: async ({ resource, id }) => {
    const restaurantId = getRestaurantId();
    const url = `/restaurants/${restaurantId}/${resource}/${id}`;
    const { data } = await api.delete(url);
    return { data };
  },

  getApiUrl: () => API_URL,

  custom: async ({ url, method, filters, sorters, payload, query, headers }) => {
    let requestUrl = `${API_URL}${url}`;

    if (query) {
      const queryString = new URLSearchParams(query).toString();
      requestUrl = `${requestUrl}?${queryString}`;
    }

    const response = await api.request({
      url: requestUrl,
      method,
      data: payload,
      headers,
    });

    return { data: response.data };
  },
};
