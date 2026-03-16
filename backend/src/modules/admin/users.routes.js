import express from "express";
import usersControllerRouter from "./users.controller.js";

const usersRouter = express.Router();

usersRouter.use(usersControllerRouter);

export default usersRouter;
