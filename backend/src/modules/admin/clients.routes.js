import express from "express";
import clientsControllerRouter from "./clients.controller.js";

const clientsRouter = express.Router();

clientsRouter.use(clientsControllerRouter);

export default clientsRouter;
