import redisClient from "~/services/redis.server";

async function fetchGuildMembersChunk(lastUserId?: string) {
  let discordBotToken = process.env.DISCORD_BOT_TOKEN;

  const authHeaders = {
    Authorization: `Bot ${discordBotToken}`,
  };

  const snowflakeQuery = lastUserId ? `&after=${lastUserId}` : "";

  return fetch(
    `https://discordapp.com/api/guilds/${process.env.DISCORD_GUILD_ID}/members?limit=1000${snowflakeQuery}`,
    {
      headers: authHeaders,
    }
  );
}

export async function fetchAllGuildMembers(
  previousMembers: any[] = [],
  lastUserId?: string
): Promise<string> {
  const response = await fetchGuildMembersChunk(lastUserId);

  const clonedResponse = response.clone();

  const newMembers = await clonedResponse.json();

  const members =
    newMembers.length > 0
      ? [...previousMembers, ...newMembers]
      : previousMembers;

  const lastItem = members[members.length - 1];

  if (newMembers.length > 0) {
    return await fetchAllGuildMembers(members, lastItem.user.id);
  } else {
    return JSON.stringify(members);
  }
}

export async function isMemberOfGuild(id: string): Promise<boolean> {
  const discordGuildMembers = await redisClient.get("discordGuildMembers");

  const parsedResult = discordGuildMembers && JSON.parse(discordGuildMembers);

  console.log(parsedResult, discordGuildMembers);
  const matchingUser = parsedResult.find(
    (resultItem: { user: { id: string } }) => resultItem.user.id === id
  );

  return !!matchingUser;
}
