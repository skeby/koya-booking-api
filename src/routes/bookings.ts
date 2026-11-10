import { Router } from "express";
import * as bookings_controller from "../controllers/bookings.js";

export const bookings_router = Router();

bookings_router.post("/", bookings_controller.create_booking);
bookings_router.get("/", bookings_controller.list_bookings);
bookings_router.get("/:id", bookings_controller.get_booking);
bookings_router.delete("/:id", bookings_controller.cancel_booking);
