import os 
from dotenv import load_dotenv


load_dotenv()

path = os.getenv()


with open(path,"r",encoding="utf-8") as file:
    data = file.read()
    print(data)