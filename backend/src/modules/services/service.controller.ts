
import type { Request, Response } from "express";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../config/prisma.js";

import {
  createServiceSchema,
  updateServiceSchema,
  updateServiceStatusSchema,
} from "./service.schema.js";

// Get the authenticated user's ID
function getUserId(res: Response): string {
  return res.locals.auth.userId;
}

// CREATE SERVICE
export async function createService(req: Request, res: Response) {
  const parsed = createServiceSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      code: "VALIDATION_ERROR",
      errors: parsed.error.flatten(),
    });
  }

  const userId = getUserId(res);
  const input = parsed.data;

  try {
    // Check whether the user already has a seller profile
    const sellerProfile = await prisma.sellerProfile.findUnique({
      where: {
        userId,
      },
    });

    if (!sellerProfile) {
      return res.status(404).json({
        success: false,
        message: "Seller profile not found. Create a seller profile first.",
        code: "SELLER_PROFILE_NOT_FOUND",
      });
    }

    // Check whether the category exists
    const category = await prisma.category.findUnique({
      where: {
        id: input.categoryId,
      },
    });

    if (!category || !category.isActive) {
      return res.status(400).json({
        success: false,
        message: "Category does not exist or is inactive",
        code: "INVALID_CATEGORY",
      });
    }

    // Create the service
    const service = await prisma.service.create({
      data: {
        sellerId: sellerProfile.id,
        categoryId: input.categoryId,
        title: input.title,
        slug: input.slug,
        description: input.description,
        price: input.price,
        dpPercent: input.dpPercent ?? null,
        region: input.region,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        estimatedDays: input.estimatedDays ?? null,
        maxBookingsPerDay: input.maxBookingsPerDay,
      },
      include: {
        category: true,
        seller: true,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Service created successfully",
      data: service,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return res.status(409).json({
        success: false,
        message: "Service slug already exists",
        code: "DUPLICATE_SLUG",
      });
    }

    console.error("Create service error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create service",
      code: "INTERNAL_SERVER_ERROR",
    });
  }
}

// GET SERVICES OWNED BY THE LOGGED-IN SELLER
export async function getMyServices(req: Request, res: Response) {
  const userId = getUserId(res);

  try {
    const sellerProfile = await prisma.sellerProfile.findUnique({
      where: {
        userId,
      },
    });

    if (!sellerProfile) {
      return res.status(404).json({
        success: false,
        message: "Seller profile not found",
        code: "SELLER_PROFILE_NOT_FOUND",
      });
    }

    const services = await prisma.service.findMany({
      where: {
        sellerId: sellerProfile.id,
      },
      include: {
        category: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return res.status(200).json({
      success: true,
      message: "Seller services retrieved successfully",
      data: services,
    });
  } catch (error) {
    console.error("Get my services error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve services",
      code: "INTERNAL_SERVER_ERROR",
    });
  }
}

// GET ONE SERVICE
export async function getServiceById(req: Request, res: Response) {
  const serviceId = req.params["id"];

  if (typeof serviceId !== "string") {
    res.status(400).json({
      success: false,
      message: "Service ID is required",
      code: "SERVICE_ID_REQUIRED",
    });

    return;
  }

  try {
    const service = await prisma.service.findUnique({
      where: {
        id: serviceId,
      },
      include: {
        category: true,
        seller: true,
        images: true,
      },
    });

    if (!service) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
        code: "SERVICE_NOT_FOUND",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Service retrieved successfully",
      data: service,
    });
  } catch (error) {
    console.error("Get service error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve service",
      code: "INTERNAL_SERVER_ERROR",
    });
  }
}

// UPDATE SERVICE INFORMATION
export async function updateService(req: Request, res: Response) {
  const serviceId = req.params["id"];

  if (typeof serviceId !== "string") {
    res.status(400).json({
      success: false,
      message: "Service ID is required",
      code: "SERVICE_ID_REQUIRED",
    });

    return;
  }

  const parsed = updateServiceSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      code: "VALIDATION_ERROR",
      errors: parsed.error.flatten(),
    });
  }

  const userId = getUserId(res);

  try {
    const sellerProfile = await prisma.sellerProfile.findUnique({
      where: {
        userId,
      },
    });

    if (!sellerProfile) {
      return res.status(404).json({
        success: false,
        message: "Seller profile not found",
        code: "SELLER_PROFILE_NOT_FOUND",
      });
    }

    const existingService = await prisma.service.findUnique({
      where: {
        id: serviceId,
      },
    });

    if (!existingService) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
        code: "SERVICE_NOT_FOUND",
      });
    }

    // Make sure the service belongs to the logged-in seller
    if (existingService.sellerId !== sellerProfile.id) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to update this service",
        code: "FORBIDDEN",
      });
    }

    const updatedService = await prisma.service.update({
      where: {
        id: serviceId,
      },
      data: parsed.data,
      include: {
        category: true,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Service updated successfully",
      data: updatedService,
    });
  } catch (error) {
    console.error("Update service error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update service",
      code: "INTERNAL_SERVER_ERROR",
    });
  }
}

// UPDATE SERVICE STATUS
export async function updateServiceStatus(req: Request, res: Response) {
  const serviceId = req.params["id"];

  if (typeof serviceId !== "string") {
    res.status(400).json({
      success: false,
      message: "Service ID is required",
      code: "SERVICE_ID_REQUIRED",
    });

    return;
  }

  const parsed = updateServiceStatusSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: "Invalid service status",
      code: "VALIDATION_ERROR",
      errors: parsed.error.flatten(),
    });
  }

  const userId = getUserId(res);

  try {
    const sellerProfile = await prisma.sellerProfile.findUnique({
      where: {
        userId,
      },
    });

    if (!sellerProfile) {
      return res.status(404).json({
        success: false,
        message: "Seller profile not found",
        code: "SELLER_PROFILE_NOT_FOUND",
      });
    }

    const existingService = await prisma.service.findUnique({
      where: {
        id: serviceId,
      },
    });

    if (!existingService) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
        code: "SERVICE_NOT_FOUND",
      });
    }

    // Make sure the service belongs to the logged-in seller
    if (existingService.sellerId !== sellerProfile.id) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to update this service",
        code: "FORBIDDEN",
      });
    }

    const updatedService = await prisma.service.update({
      where: {
        id: serviceId,
      },
      data: {
        status: parsed.data.status,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Service status updated successfully",
      data: updatedService,
    });
  } catch (error) {
    console.error("Update service status error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update service status",
      code: "INTERNAL_SERVER_ERROR",
    });
  }
}

// DELETE SERVICE
export async function deleteService(req: Request, res: Response) {
  const serviceId = req.params["id"];

  if (typeof serviceId !== "string") {
    res.status(400).json({
      success: false,
      message: "Service ID is required",
      code: "SERVICE_ID_REQUIRED",
    });

    return;
  }

  const userId = getUserId(res);

  try {
    const sellerProfile = await prisma.sellerProfile.findUnique({
      where: {
        userId,
      },
    });

    if (!sellerProfile) {
      return res.status(404).json({
        success: false,
        message: "Seller profile not found",
        code: "SELLER_PROFILE_NOT_FOUND",
      });
    }

    const existingService = await prisma.service.findUnique({
      where: {
        id: serviceId,
      },
    });

    if (!existingService) {
      return res.status(404).json({
        success: false,
        message: "Service not found",
        code: "SERVICE_NOT_FOUND",
      });
    }

    // Make sure the service belongs to the logged-in seller
    if (existingService.sellerId !== sellerProfile.id) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to delete this service",
        code: "FORBIDDEN",
      });
    }

    await prisma.service.delete({
      where: {
        id: serviceId,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Service deleted successfully",
    });
  } catch (error) {
    console.error("Delete service error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete service",
      code: "INTERNAL_SERVER_ERROR",
    });
  }
}