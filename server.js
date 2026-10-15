import dns from "dns";
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import mongoose from "mongoose";
import itemRoutes from "./routes/itemRoutes.js";

dotenv.config();

// Local router DNS can't resolve MongoDB Atlas SRV records, so use public DNS.
// Vercel's DNS works fine, so only do this when running locally.
if (!process.env.VERCEL) {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
}

// Resolve the cluster's server hostnames through the same public DNS,
// falling back to the system resolver if that fails
const publicDnsLookup = (hostname, options, callback) => {
  dns.resolve4(hostname, (error, addresses) => {
    if (error || addresses.length === 0) {
      return dns.lookup(hostname, options, callback);
    }
    if (options.all) {
      return callback(null, addresses.map((address) => ({ address, family: 4 })));
    }
    callback(null, addresses[0], 4);
  });
};

const connectOptions = process.env.VERCEL ? {} : { lookup: publicDnsLookup };

// Reuse one connection across requests (Vercel keeps it between warm invocations)
let connection;
const connectDB = () => {
  if (!connection) {
    connection = mongoose.connect(process.env.MONGO_URI, connectOptions).catch((error) => {
      connection = null;
      throw error;
    });
  }
  return connection;
};

const app = express();

app.use(cors());
app.use(express.json());

app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (error) {
    console.error("Database connection error:", error.message);
    res.status(500).json({ message: "Database connection failed" });
  }
});

app.get("/", (req, res) => {
  res.json({ message: "Item Manager API is running..." });
});

app.use("/api/items", itemRoutes);

// On Vercel the app is exported and run as a function; locally we start a server
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 5000;

  connectDB()
    .then(() => {
      console.log("MongoDB connected");
      app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
      });
    })
    .catch((error) => {
      console.error("Database connection error:", error.message);
      process.exit(1);
    });
}

export default app;
