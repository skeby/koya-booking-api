import { Router } from "express";
import * as slots_controller from "../controllers/slots.js";

export const slots_router = Router();

slots_router.post("/reset", slots_controller.reset);
slots_router.get("/slots", slots_controller.list_slots);
