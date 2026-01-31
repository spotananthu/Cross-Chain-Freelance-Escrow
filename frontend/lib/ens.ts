import { createPublicClient, http } from 'viem'
import { mainnet } from 'viem/chains'
import { normalize } from 'viem/ens'

const publicClient = createPublicClient({
  chain: mainnet,
  transport: http(),
})

export async function resolveENSName(address: string): Promise<string | null> {
  try {
    const ensName = await publicClient.getEnsName({
      address: address as `0x${string}`,
    })
    return ensName
  } catch (error) {
    console.error('ENS resolution error:', error)
    return null
  }
}

export async function resolveENSAddress(name: string): Promise<string | null> {
  try {
    const address = await publicClient.getEnsAddress({
      name: normalize(name),
    })
    return address
  } catch (error) {
    console.error('ENS address resolution error:', error)
    return null
  }
}

export async function getENSAvatar(name: string): Promise<string | null> {
  try {
    const avatar = await publicClient.getEnsAvatar({
      name: normalize(name),
    })
    return avatar
  } catch (error) {
    console.error('ENS avatar resolution error:', error)
    return null
  }
}
