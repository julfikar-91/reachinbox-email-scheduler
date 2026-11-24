import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Figma demo data to Neon PostgreSQL...');

  const user = await prisma.user.upsert({
    where: { email: 'oliver.brown@domain.io' },
    update: {
      name: 'Oliver Brown',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop',
    },
    create: {
      googleId: 'figma-demo-oliver-brown',
      name: 'Oliver Brown',
      email: 'oliver.brown@domain.io',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop',
    },
  });

  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@reachinbox.test' },
    update: {
      name: 'Oliver Brown',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop',
    },
    create: {
      googleId: 'demo-reachinbox-user',
      name: 'Oliver Brown',
      email: 'demo@reachinbox.test',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop',
    },
  });

  for (const u of [user, demoUser]) {
    // Upsert Senders
    const sender = await prisma.sender.upsert({
      where: {
        userId_email: {
          userId: u.id,
          email: 'sender@example.com',
        },
      },
      update: {
        smtpConfiguration: {
          name: 'Amanda Clark',
          host: 'smtp.ethereal.email',
          port: 587,
          user: 'amanda.ethereal',
          passEncrypted: 'mock-encrypted-pass',
        },
      },
      create: {
        userId: u.id,
        email: 'sender@example.com',
        hourlyLimit: 100,
        isActive: true,
        smtpConfiguration: {
          name: 'Amanda Clark',
          host: 'smtp.ethereal.email',
          port: 587,
          user: 'amanda.ethereal',
          passEncrypted: 'mock-encrypted-pass',
        },
      },
    });

    const oliverSender = await prisma.sender.upsert({
      where: {
        userId_email: {
          userId: u.id,
          email: 'oliver.brown@domain.io',
        },
      },
      update: {
        smtpConfiguration: {
          name: 'Oliver Brown',
          host: 'smtp.ethereal.email',
          port: 587,
          user: 'oliver.ethereal',
          passEncrypted: 'mock-encrypted-pass',
        },
      },
      create: {
        userId: u.id,
        email: 'oliver.brown@domain.io',
        hourlyLimit: 100,
        isActive: true,
        smtpConfiguration: {
          name: 'Oliver Brown',
          host: 'smtp.ethereal.email',
          port: 587,
          user: 'oliver.ethereal',
          passEncrypted: 'mock-encrypted-pass',
        },
      },
    });

    // Delete previous seed emails for a clean fresh slate
    await prisma.email.deleteMany({
      where: {
        userId: u.id,
        idempotencyKey: {
          startsWith: 'figma-seed-',
        },
      },
    });

    const futureDate1 = new Date(Date.now() + 2 * 86400000);
    const futureDate2 = new Date(Date.now() + 4 * 86400000);
    const pastDate1 = new Date(Date.now() - 3600000 * 3);
    const pastDate2 = new Date(Date.now() - 3600000 * 24);

    const figmaBody = `Hey Oliver,

You've just RECEIVED something

⚡ Extremely Exclusive—Only 4 Spots Worldwide Per Year | $25,000 investment ⚡
⚡ To explore securing your private transformation, simply reply right now with "FLY OUT FIX"

Your coach for world-class performance,

Grant

P.S. Always remember that you can develop world class technique! 🚀`;

    await prisma.email.createMany({
      data: [
        // ── Scheduled Emails (Figma Image 2) ──
        {
          userId: u.id,
          senderId: oliverSender.id,
          to: 'John Smith',
          recipient: 'john.smith@example.com',
          subject: 'Meeting follow-up - Scheduled',
          body: 'Hi John, just wanted to follow up on our meeting...',
          scheduledAt: futureDate1,
          status: 'SCHEDULED',
          idempotencyKey: `figma-seed-sched-1-${u.id}`,
        },
        {
          userId: u.id,
          senderId: oliverSender.id,
          to: 'Olive',
          recipient: 'olive@example.com',
          subject: "Ramit, great to meet you - you'll love it",
          body: 'Hi Olive, just wanted to follow up on our meeting...',
          scheduledAt: futureDate2,
          status: 'SCHEDULED',
          idempotencyKey: `figma-seed-sched-2-${u.id}`,
        },
        // ── Sent Emails (Figma Image 3 & 4) ──
        {
          userId: u.id,
          senderId: sender.id,
          to: 'Sarah Wilson',
          recipient: 'sarah.wilson@example.com',
          subject: 'Oliver, hello there! | MJWYT44 BM#52W01',
          body: figmaBody,
          scheduledAt: pastDate1,
          sentAt: pastDate1,
          status: 'SENT',
          previewUrl: 'https://ethereal.email',
          idempotencyKey: `figma-seed-sent-1-${u.id}`,
        },
        {
          userId: u.id,
          senderId: oliverSender.id,
          to: 'Support',
          recipient: 'support@example.com',
          subject: 'Issue with login',
          body: 'I am having trouble logging in to the dashboard...',
          scheduledAt: pastDate2,
          sentAt: pastDate2,
          status: 'SENT',
          previewUrl: 'https://ethereal.email',
          idempotencyKey: `figma-seed-sent-2-${u.id}`,
        },
      ],
    });
  }

  console.log('Seeding completed successfully!');
}

main()
  .catch((err) => {
    console.error('Error seeding data:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
