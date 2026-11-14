import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import authRoutes from "./modules/auth/auth.routes.js";
import sellerRoutes from "./modules/sellers/seller.routes.js";
import serviceRoutes from "./modules/services/service.routes.js";
import catalogRoutes from "./modules/catalog/catalog.routes.js";
import bookingRoutes from "./modules/bookings/booking.routes.js";
import serviceAvailabilityRoutes from "./modules/services/service-availability.routes.js";
import conversationRoutes from "./modules/conversations/conversation.routes.js";
import notificationRoutes from "./modules/notifications/notification.routes.js";
import reviewRoutes from "./modules/reviews/review.routes.js";
import reportRoutes from "./modules/reports/report.routes.js";
import { errorHandler, notFoundHandler } from "./lib/http.js";

const app = express();

// Security headers
app.use(helmet());

// Allow requests from React Vite frontend
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Parse JSON request
app.use(express.json({ limit: "10kb" }));

// General rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Terlalu banyak permintaan. Silakan coba lagi nanti.",
    },
  },
});

app.use(limiter);
app.use("/api/auth", authRoutes);
app.use("/api/sellers", sellerRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/v1", bookingRoutes);
app.use("/api/v1", serviceAvailabilityRoutes);
app.use("/api/v1", conversationRoutes);
app.use("/api/v1", notificationRoutes);
app.use("/api/v1", reviewRoutes);
app.use("/api/v1", reportRoutes);
app.use("/api/v1", catalogRoutes);

app.get("/", (_req, res) => {
  res.status(200).json({
    message: "Welcome to our Hackathon API!",
    documentation: "/health",
  });
});

// Health check endpoint
app.get("/health", (_req, res) => {
  res.status(200).json({
    data: {
      status: "ok",
      message: "Backend is running!",
    },
  });
});

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
