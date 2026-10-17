import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
const publicGroups = { isPublic: true, deletedAt: null, slips: { some: {} } };
export const creatorSelect = { publicId: true, username: true } as const;
export function creatorLabel(user: { publicId: string; username: string | null }) {
  return { publicId: user.publicId, username: user.username, name: user.username ? `@${user.username}` : `Creator ${user.publicId.slice(-6)}` };
}
@Injectable()
export class CreatorsService {
  constructor(private readonly prisma: PrismaService) {}
  async discover(search = '', page = 1, viewerId?: string) {
    const rows = await this.prisma.appUser.findMany({ where: { groups: { some: publicGroups },
      ...(search ? { OR: [{ username: { contains: search, mode: 'insensitive' as const } }, { publicId: { contains: search, mode: 'insensitive' as const } }] } : {}) },
      take: 50, skip: (page - 1) * 50, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { ...creatorSelect, id: true, _count: { select: { groups: { where: publicGroups }, followers: true } },
        followers: { where: { followerId: viewerId ?? '__anonymous__' }, select: { followerId: true } } } });
    return rows.map(row => ({ ...creatorLabel(row), isSelf: row.id === viewerId, following: !!row.followers.length, publicCollections: row._count.groups, followerCount: row._count.followers }));
  }
  async profile(publicId: string, viewerId?: string) {
    const user = await this.prisma.appUser.findUnique({ where: { publicId }, select: { ...creatorSelect, id: true,
      _count: { select: { groups: { where: publicGroups }, followers: true } }, followers: { where: { followerId: viewerId ?? '__anonymous__' }, select: { followerId: true } } } });
    if (!user) throw new NotFoundException('Creator not found');
    return { ...creatorLabel(user), isSelf: user.id === viewerId, following: !!user.followers.length, publicCollections: user._count.groups, followerCount: user._count.followers };
  }
  async follow(publicId: string, followerId: string) {
    const creator = await this.prisma.appUser.findUnique({ where: { publicId }, select: { id: true } });
    if (!creator) throw new NotFoundException('Creator not found');
    if (creator.id === followerId) throw new BadRequestException('You cannot monitor yourself');
    await this.prisma.creatorFollow.upsert({ where: { followerId_creatorId: { followerId, creatorId: creator.id } }, create: { followerId, creatorId: creator.id }, update: {} });
    return { following: true };
  }
  async unfollow(publicId: string, followerId: string) {
    const creator = await this.prisma.appUser.findUnique({ where: { publicId }, select: { id: true } });
    if (creator) await this.prisma.creatorFollow.deleteMany({ where: { followerId, creatorId: creator.id } });
    return { following: false };
  }
  async monitoring(followerId: string, page = 1) {
    const rows = await this.prisma.creatorFollow.findMany({ where: { followerId }, take: 50, skip: (page - 1) * 50,
      orderBy: [{ createdAt: 'desc' }, { creatorId: 'desc' }], select: { createdAt: true, creator: { select: { ...creatorSelect, _count: { select: { groups: { where: publicGroups }, followers: true } } } } } });
    return rows.map(row => ({ ...creatorLabel(row.creator), following: true, isSelf: false, followedAt: row.createdAt.toISOString(), publicCollections: row.creator._count.groups, followerCount: row.creator._count.followers }));
  }
}
