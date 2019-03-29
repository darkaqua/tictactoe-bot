
global.config = require('./config.json')

const Discord = require('discord.js')
const client = new Discord.Client()

const messageHandler = require('./bot/events/message')
client.on('message', (message) => {
    if(!message.bot && message.content.startsWith(global.config.prefix)) {
        messageHandler(message)
    }
})

client.login(global.config.token)