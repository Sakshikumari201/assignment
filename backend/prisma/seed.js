const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Hash standard password "password123"
  const passwordHash = await bcrypt.hash('password123', 10);

  const usersData = [
    { name: 'Aisha', email: 'aisha@example.com', passwordHash },
    { name: 'Rohan', email: 'rohan@example.com', passwordHash },
    { name: 'Priya', email: 'priya@example.com', passwordHash },
    { name: 'Meera', email: 'meera@example.com', passwordHash },
    { name: 'Dev', email: 'dev@example.com', passwordHash },
    { name: 'Sam', email: 'sam@example.com', passwordHash },
  ];

  const users = [];
  for (const u of usersData) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: u,
    });
    users.push(user);
    console.log(`User seeded: ${user.name} (${user.email})`);
  }

  // Create default Group
  const groupName = 'Co-Living Suite 404';
  const group = await prisma.group.create({
    data: {
      name: groupName,
    },
  });
  console.log(`Group created: ${group.name} (ID: ${group.id})`);

  // Add members with specific timeline rules
  // Meera: active 2025-02-01 to 2025-03-31
  // Sam: active 2025-04-15 to null
  // Others: active 2025-01-01 to null
  const memberships = [
    { name: 'Aisha', joinedAt: '2025-01-01T00:00:00Z', leftAt: null },
    { name: 'Rohan', joinedAt: '2025-01-01T00:00:00Z', leftAt: null },
    { name: 'Priya', joinedAt: '2025-01-01T00:00:00Z', leftAt: null },
    { name: 'Dev', joinedAt: '2025-01-01T00:00:00Z', leftAt: null },
    { name: 'Meera', joinedAt: '2025-02-01T00:00:00Z', leftAt: '2025-03-31T23:59:59Z' },
    { name: 'Sam', joinedAt: '2025-04-15T00:00:00Z', leftAt: null },
  ];

  for (const m of memberships) {
    const userObj = users.find((u) => u.name === m.name);
    if (userObj) {
      await prisma.groupMember.create({
        data: {
          groupId: group.id,
          userId: userObj.id,
          joinedAt: new Date(m.joinedAt),
          leftAt: m.leftAt ? new Date(m.leftAt) : null,
        },
      });
      console.log(`Added member: ${m.name} [Joined: ${m.joinedAt.split('T')[0]}, Left: ${m.leftAt ? m.leftAt.split('T')[0] : 'Present'}]`);
    }
  }

  // Add an initial multi-currency expense to test calculations (e.g. Jan 15, Dinner paid by Aisha)
  const aisha = users.find((u) => u.name === 'Aisha');
  const rohan = users.find((u) => u.name === 'Rohan');
  const priya = users.find((u) => u.name === 'Priya');
  const dev = users.find((u) => u.name === 'Dev');

  const initialExpense = await prisma.expense.create({
    data: {
      groupId: group.id,
      title: 'Move-in Grocery Run',
      description: 'Stocking pantry and cleaning supplies',
      amount: 150.0,
      currency: 'USD',
      exchangeRate: 83.5, // 150 USD -> 12,525 INR
      convertedAmount: 12525.0,
      paidBy: aisha.id,
      expenseDate: new Date('2025-01-15T12:00:00Z'),
      splitType: 'EQUAL',
      splits: {
        create: [
          { userId: aisha.id, shareAmount: 3131.25, percentage: 25, shares: 1 },
          { userId: rohan.id, shareAmount: 3131.25, percentage: 25, shares: 1 },
          { userId: priya.id, shareAmount: 3131.25, percentage: 25, shares: 1 },
          { userId: dev.id, shareAmount: 3131.25, percentage: 25, shares: 1 },
        ],
      },
    },
  });

  console.log(`Initial expense seeded: "${initialExpense.title}" (Paid by Aisha, 150 USD)`);
  console.log('Database successfully seeded!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
