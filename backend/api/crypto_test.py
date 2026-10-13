import os

from dotenv import load_dotenv
from web3 import Web3

load_dotenv()

RPC_URL = os.getenv("POLYGON_RPC_URL")
WALLET = os.getenv("POLYGON_ADDR")

w3 = Web3(Web3.HTTPProvider(RPC_URL))

print("Connected:", w3.is_connected())
print("Chain ID:", w3.eth.chain_id)

wallet = Web3.to_checksum_address(WALLET)

balance = w3.eth.get_balance(wallet)

print("Wallet:", wallet)
print("POL:", w3.from_wei(balance, "ether"))