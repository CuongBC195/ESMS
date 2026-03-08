import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";
import "dotenv/config";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log("🌱 Seeding database...");

    // Create ADMIN user
    const passwordHash = await hash("123123", 12);

    const adminUser = await prisma.user.upsert({
        where: { email: "admin" },
        update: {},
        create: {
            email: "admin",
            passwordHash,
            role: "ADMIN",
        },
    });

    console.log("✅ Admin user created:", {
        id: adminUser.id,
        email: adminUser.email,
        role: adminUser.role,
    });

    console.log("🌱 Seeding complete!");
}

main()
    .catch((e) => {
        console.error("❌ Seeding failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
