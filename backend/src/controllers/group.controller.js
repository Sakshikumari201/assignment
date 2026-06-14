const prisma = require('../prisma/prisma-client');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../utils/errors');

async function createGroup(req, res, next) {
  try {
    const { name } = req.body;
    if (!name) {
      throw new BadRequestError('Group name is required');
    }

    // Create group and add the creator as the first member
    const group = await prisma.group.create({
      data: {
        name,
        members: {
          create: {
            userId: req.user.id,
            joinedAt: new Date(),
            leftAt: null,
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    return res.status(201).json(group);
  } catch (error) {
    next(error);
  }
}

async function getGroups(req, res, next) {
  try {
    const groups = await prisma.group.findMany({
      where: {
        members: {
          some: {
            userId: req.user.id,
          },
        },
      },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return res.json(groups);
  } catch (error) {
    next(error);
  }
}

async function getGroupById(req, res, next) {
  try {
    const groupId = parseInt(req.params.id);
    if (isNaN(groupId)) {
      throw new BadRequestError('Invalid group ID');
    }

    // Verify membership
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId: req.user.id,
        },
      },
    });

    if (!membership) {
      throw new ForbiddenError('You are not a member of this group');
    }

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
        expenses: {
          include: {
            payer: {
              select: { id: true, name: true, email: true },
            },
            splits: {
              include: {
                user: {
                  select: { id: true, name: true, email: true },
                },
              },
            },
          },
          orderBy: {
            expenseDate: 'desc',
          },
        },
        settlements: {
          include: {
            payer: {
              select: { id: true, name: true, email: true },
            },
            receiver: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: {
            settlementDate: 'desc',
          },
        },
      },
    });

    if (!group) {
      throw new NotFoundError('Group not found');
    }

    return res.json(group);
  } catch (error) {
    next(error);
  }
}

async function addMember(req, res, next) {
  try {
    const groupId = parseInt(req.params.id);
    const { email, joinedAt, leftAt } = req.body;

    if (isNaN(groupId)) {
      throw new BadRequestError('Invalid group ID');
    }

    if (!email) {
      throw new BadRequestError('Member email is required');
    }

    // Verify creator is in the group
    const creatorMembership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId: req.user.id,
        },
      },
    });

    if (!creatorMembership) {
      throw new ForbiddenError('You must be a member of the group to add others');
    }

    // Find user by email
    const userToAdd = await prisma.user.findUnique({
      where: { email },
    });

    if (!userToAdd) {
      throw new NotFoundError(`User with email "${email}" not found`);
    }

    // Check if user is already a member
    const existingMembership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId: userToAdd.id,
        },
      },
    });

    if (existingMembership) {
      throw new BadRequestError('User is already a member of this group');
    }

    const memberJoinedAt = joinedAt ? new Date(joinedAt) : new Date();
    const memberLeftAt = leftAt ? new Date(leftAt) : null;

    if (memberLeftAt && memberJoinedAt > memberLeftAt) {
      throw new BadRequestError('joinedAt must be before leftAt');
    }

    const newMember = await prisma.groupMember.create({
      data: {
        groupId,
        userId: userToAdd.id,
        joinedAt: memberJoinedAt,
        leftAt: memberLeftAt,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return res.status(201).json(newMember);
  } catch (error) {
    next(error);
  }
}

async function updateMember(req, res, next) {
  try {
    const groupId = parseInt(req.params.id);
    const userId = parseInt(req.params.memberId);
    const { joinedAt, leftAt } = req.body;

    if (isNaN(groupId) || isNaN(userId)) {
      throw new BadRequestError('Invalid group or member ID');
    }

    // Verify requester is in the group
    const requesterMembership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId: req.user.id,
        },
      },
    });

    if (!requesterMembership) {
      throw new ForbiddenError('You must be a member of the group to update membership');
    }

    // Verify member exists in group
    const targetMembership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
    });

    if (!targetMembership) {
      throw new NotFoundError('Member not found in this group');
    }

    const updatedJoinedAt = joinedAt ? new Date(joinedAt) : targetMembership.joinedAt;
    const updatedLeftAt = leftAt === null ? null : (leftAt ? new Date(leftAt) : targetMembership.leftAt);

    if (updatedLeftAt && updatedJoinedAt > updatedLeftAt) {
      throw new BadRequestError('joinedAt must be before leftAt');
    }

    const updatedMember = await prisma.groupMember.update({
      where: {
        groupId_userId: {
          groupId,
          userId,
        },
      },
      data: {
        joinedAt: updatedJoinedAt,
        leftAt: updatedLeftAt,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return res.json(updatedMember);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createGroup,
  getGroups,
  getGroupById,
  addMember,
  updateMember,
};
