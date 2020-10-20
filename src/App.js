import React from 'react';
import Button from 'react-bootstrap-button-loader';
import {Navbar, Image} from 'react-bootstrap';
import ERC20ABI from "./ERC20";
import Sablier from "./Sablier";
import USDCFaucet from "./USDCFaucet";
import USDC from "./USDC"
import Datetime from 'react-datetime';
import moment from 'moment';
import Web3 from 'web3';

const expectedBlockTime = 13000;
const sablierAddress = '0xc04Ad234E01327b24a831e3718DBFcbE245904CC';
const usdcAddress = '0x07865c6E87B9F70255377e024ace6630C1Eaa37F';
const usdcFaucetAddress = '0x34bE201A6d1CBB71Bff0C07161a61662295eE56D';
const biconomyAPIKey = '';
const transferWithAuthorizationApiId = '';
const permitApiId = '';

const sleep = (milliseconds) => {
    return new Promise(resolve => setTimeout(resolve, milliseconds))
};


class App extends React.Component {
    state = {
        account: '',
        tokenBalances: {},
        web3: '',
        provider: '',
        loadingBuy: false,
        loadingCreateStream: false,
        loadingWithdrawStream: false,
        streamToken: usdcAddress,
        streamAmount: '',
        streamRecipient: '',
        streamStartTime: moment().add(10, 'minutes'),
        streamStopTime: moment().add(70, 'minutes'),
        streamId: '',
        streamWithdrawAmount: '',
        withdrawStreamId: '',
        sendToken: usdcAddress,
        sendAmount: '',
        sendAddress: '',
        loadingSend: false
    };

    async login() {
        if(!window.ethereum){
            alert('Metamask is not installed!');
            return
        }
        const provider = window.ethereum;
        await this.subscribeProvider(provider);
        let web3 = new Web3(provider);
        window.ethereum.enable();
        const accounts = await web3.eth.getAccounts();
        const address = accounts[0];
        const networkId = await web3.eth.net.getId();
        if (networkId !== 3) {
            alert('App works only for Ropsten testnet');
            return;
        }
        this.setState({
            web3: web3,
            account: address,
            provider: provider
        });
        await this.updateTokenBalances();
    }

    async logout() {
        this.resetApp();
    }

    async subscribeProvider(provider) {
        if (!provider.on) {
            return;
        }
        provider.on("close", () => this.resetApp());
        provider.on("accountsChanged", async (accounts) => {
            await this.setState({account: accounts[0]});
            await this.updateTokenBalances();
        });
        provider.on("chainChanged", async (chainId) => {
            const {web3} = this.state;
            const networkId = await web3.eth.net.getId();
            if (networkId !== 3) {
                alert('App works only for Ropsten testnet');
                return;
            }
            await this.updateTokenBalances();
        });

        provider.on("networkChanged", async (networkId) => {
            if (networkId !== 3) {
                alert('App works only for Ropsten testnet');
                return;
            }
            await this.updateTokenBalances();
        });
    };

    async resetApp() {
        const {web3} = this.state;
        if (web3 && web3.currentProvider && web3.currentProvider.close) {
            await web3.currentProvider.close();
        }
        this.setState({account: '', web3: '', provider: ''});
    };

    async updateTokenBalances() {
        let tokenBalances = this.state.tokenBalances;
        let tokenMapping = {'USDC': usdcAddress};
        Object.keys(tokenMapping).map(async (key, index) => {
            try {
                if (key === 'ETH') {
                    let balance = await this.state.web3.eth.getBalance(this.state.account);
                    balance = this.state.web3.utils.fromWei(balance);
                    tokenBalances[key] = balance.toString();
                    return
                }
                let address = tokenMapping[key];
                let contract = new this.state.web3.eth.Contract(ERC20ABI, address);
                let decimals = await contract.methods.decimals().call();
                let balance = await contract.methods.balanceOf(this.state.account).call();
                if (decimals === '6') {
                    balance = this.state.web3.utils.fromWei(balance, "mwei");
                } else {
                    balance = this.state.web3.utils.fromWei(balance);
                }
                tokenBalances[key] = balance.toString();
                this.setState({tokenBalances: tokenBalances});
            } catch (e) {

            }
        });
    }

    async buyUSDC() {
        const faucetContract = new this.state.web3.eth.Contract(USDCFaucet, usdcFaucetAddress);
        this.setState({loadingBuy: true});
        try {
            await faucetContract.methods.claim().send({from: this.state.account});
        } catch (e) {
            alert('You can claim from faucet only once per hour');
            this.setState({loadingBuy: false});
            return
        }
        await this.updateTokenBalances();
        this.setState({loadingBuy: false});
    }

    updateSendAmount(value) {
        if (value === '') {
            this.setState({sendAmount: value});
            return
        }
        let valid = value.match(/^[+]?(?=.?\d)\d*(\.\d{0,18})?$/);
        if (!valid) {
            return
        }
        this.setState({sendAmount: value})
    }

    updateSendAddress(value) {
        this.setState({sendAddress: value});
    }

    async sendToken() {
        let amount = this.state.sendAmount;
        let sendAddress = this.state.sendAddress;
        let tokenAddress = this.state.sendToken;
        if (amount === "" || sendAddress === "" || tokenAddress === "") {
            alert('Required fields are missing');
            return
        }
        this.setState({loadingSend: true});
        const ERC20Contract = new this.state.web3.eth.Contract(USDC, tokenAddress);
        let decimals;
        try {
            decimals = await ERC20Contract.methods.decimals().call();
        } catch (e) {
            decimals = "18";
        }
        try {
            if (decimals === '6') {
                amount = this.state.web3.utils.toWei(amount, "mwei");
            } else {
                amount = this.state.web3.utils.toWei(amount, "ether");
            }
        } catch (e) {
            alert('Only ' + decimals + ' decimals are supported for the token');
            this.setState({loadingSend: false});
            return;
        }
        try {
            const chainId = await this.state.web3.eth.net.getId();
            const name = await ERC20Contract.methods.name().call();
            const validAfter = 0;
            const validBefore = Math.floor(Date.now() / 1000) + 3600;
            const nonce = Web3.utils.randomHex(32);
            const data = {
                types: {
                    EIP712Domain: [
                        {name: "name", type: "string"},
                        {name: "version", type: "string"},
                        {name: "chainId", type: "uint256"},
                        {name: "verifyingContract", type: "address"},
                    ],
                    TransferWithAuthorization: [
                        {name: "from", type: "address"},
                        {name: "to", type: "address"},
                        {name: "value", type: "uint256"},
                        {name: "validAfter", type: "uint256"},
                        {name: "validBefore", type: "uint256"},
                        {name: "nonce", type: "bytes32"},
                    ],
                },
                domain: {
                    name: name,
                    version: "2",
                    chainId: chainId,
                    verifyingContract: tokenAddress,
                },
                primaryType: "TransferWithAuthorization",
                message: {
                    from: this.state.account,
                    to: sendAddress,
                    value: amount,
                    validAfter: validAfter,
                    validBefore: validBefore, // Valid for an hour
                    nonce: nonce,
                },
            };
            const signature = await this.state.provider.request({
                method: "eth_signTypedData_v4",
                params: [this.state.account, JSON.stringify(data)],
            });
            const v = "0x" + signature.slice(130, 132);
            const r = signature.slice(0, 66);
            const s = "0x" + signature.slice(66, 130);
            // await ERC20Contract.methods.transferWithAuthorization(this.state.account, sendAddress, amount,
            //     validAfter, validBefore, nonce, v, r, s).send({from: this.state.account});
            const postData = {
                to: usdcAddress,
                apiId: transferWithAuthorizationApiId,
                params: [this.state.account, sendAddress, amount, validAfter, validBefore, nonce, v, r, s],
                from: this.state.account
            };
            const response = await fetch('https://api.biconomy.io/api/v2/meta-tx/native', {
                method: 'POST',
                mode: 'cors',
                cache: 'no-cache',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': biconomyAPIKey
                },
                body: JSON.stringify(postData)
            });
            const responseData = await response.json();
            console.log(responseData);
            const txHash = responseData["txHash"];
            let transactionReceipt = null;
            while (transactionReceipt == null) {
                transactionReceipt = await this.state.web3.eth.getTransactionReceipt(txHash);
                await sleep(expectedBlockTime)
            }
        } catch (e) {
            console.log(e);
            alert('Send Payment failed');
        }
        await this.updateTokenBalances();
        this.setState({loadingSend: false});
    }

    updateStreamAmount(value) {
        if (value === '') {
            this.setState({streamAmount: value});
            return
        }
        let valid = value.match(/^[+]?(?=.?\d)\d*(\.\d{0,18})?$/);
        if (!valid) {
            return
        }
        this.setState({streamAmount: value})
    }

    updateStreamRecipient(value) {
        this.setState({streamRecipient: value})
    }

    updateStreamStartTime(value) {
        this.setState({streamStartTime: value})
    }

    updateStreamStopTime(value) {
        this.setState({streamStopTime: value})
    }

    updateStreamWithdrawAmount(value) {
        if (value === '') {
            this.setState({streamWithdrawAmount: value});
            return
        }
        let valid = value.match(/^[+]?(?=.?\d)\d*(\.\d{0,18})?$/);
        if (!valid) {
            return
        }
        this.setState({streamWithdrawAmount: value})
    }

    updateWithdrawStreamId(value) {
        if (value === '') {
            this.setState({withdrawStreamId: value});
            return
        }
        let valid = value.match(/^\d+$/);
        if (!valid) {
            return
        }
        this.setState({withdrawStreamId: value})
    }

    async createStream() {
        let amount = this.state.streamAmount;
        let recipient = this.state.streamRecipient;
        let startTime = this.state.streamStartTime;
        let stopTime = this.state.streamStopTime;
        let tokenAddress = this.state.streamToken;
        if (amount === '' || recipient === '' || startTime === '' || stopTime === '' || tokenAddress === '') {
            return
        }
        startTime = startTime.unix();
        stopTime = stopTime.unix();
        let date = new Date();
        let seconds = Math.round(date.getTime() / 1000);
        if (startTime - seconds < 300) {
            alert('Start time should be at least 5 minutes in future');
            return
        }
        if (stopTime - startTime < 60 * 60) {
            alert('The stream should last atleast for an hour');
            return
        }
        this.setState({loadingCreateStream: true});
        const erc20Contract = new this.state.web3.eth.Contract(USDC, tokenAddress);
        let decimals = await erc20Contract.methods.decimals().call();
        try {
            if (decimals === '6') {
                amount = this.state.web3.utils.toWei(amount, "mwei");
            } else {
                amount = this.state.web3.utils.toWei(amount, "ether");
            }
        } catch (e) {
            alert('Only ' + decimals + ' decimals are supported for the selected token');
            this.setState({loadingCreateStream: false});
            return
        }
        let mod = (amount % (stopTime - startTime));
        if (mod !== 0) {
            let updatedStreamAmount;
            let updatedStreamAmountHuman;
            if (decimals === '6') {
                updatedStreamAmount = amount - mod;
                if (updatedStreamAmount === 0) {
                    updatedStreamAmount = stopTime - startTime;
                }
                updatedStreamAmountHuman = this.state.web3.utils.fromWei(updatedStreamAmount.toString(), "mwei").toString();
            } else {
                updatedStreamAmount = amount - mod;
                if (updatedStreamAmount === 0) {
                    updatedStreamAmount = stopTime - startTime;
                }
                updatedStreamAmountHuman = this.state.web3.utils.fromWei(updatedStreamAmount.toString(), "ether").toString();
            }
            alert("Updated Stream Amount to " + updatedStreamAmountHuman +
                " to proceed ahead (Sablier Requires amount to be a multiple of the difference between stop and start time)");
            amount = updatedStreamAmount;
            this.setState({streamAmount: updatedStreamAmountHuman});
        }
        amount = amount.toString();
        const sablierContract = new this.state.web3.eth.Contract(Sablier, sablierAddress);
        try {
            // await erc20Contract.methods.approve(sablierAddress, amount).send({from: this.state.account})
            const chainId = await this.state.web3.eth.net.getId();
            const name = await erc20Contract.methods.name().call();
            const nonce = await erc20Contract.methods.nonces(this.state.account).call();
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const data = {
                types: {
                    EIP712Domain: [
                        {name: "name", type: "string"},
                        {name: "version", type: "string"},
                        {name: "chainId", type: "uint256"},
                        {name: "verifyingContract", type: "address"},
                    ],
                    Permit: [
                        {name: "owner", type: "address"},
                        {name: "spender", type: "address"},
                        {name: "value", type: "uint256"},
                        {name: "nonce", type: "uint256"},
                        {name: "deadline", type: "uint256"}
                    ],
                },
                domain: {
                    name: name,
                    version: "2",
                    chainId: chainId,
                    verifyingContract: tokenAddress,
                },
                primaryType: "Permit",
                message: {
                    owner: this.state.account,
                    spender: sablierAddress,
                    value: amount,
                    nonce: nonce,
                    deadline: deadline
                },
            };
            const signature = await this.state.provider.request({
                method: "eth_signTypedData_v4",
                params: [this.state.account, JSON.stringify(data)],
            });
            const v = "0x" + signature.slice(130, 132);
            const r = signature.slice(0, 66);
            const s = "0x" + signature.slice(66, 130);
            // await erc20Contract.methods.permit(this.state.account, sablierAddress, amount, deadline, v, r, s)
            //     .send({from: this.state.account});
            const postData = {
                to: usdcAddress,
                apiId: permitApiId,
                params: [this.state.account, sablierAddress, amount,  deadline, v, r, s],
                from: this.state.account
            };
            const response = await fetch('https://api.biconomy.io/api/v2/meta-tx/native', {
                method: 'POST',
                mode: 'cors',
                cache: 'no-cache',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': biconomyAPIKey
                },
                body: JSON.stringify(postData)
            });
            const responseData = await response.json();
            console.log(responseData);
            const txHash = responseData["txHash"];
            let transactionReceipt = null;
            while (transactionReceipt == null) {
                transactionReceipt = await this.state.web3.eth.getTransactionReceipt(txHash);
                await sleep(expectedBlockTime)
            }
        } catch (e) {
            console.log(e);
            alert('Create Stream Failed');
            this.setState({loadingCreateStream: false});
            return
        }
        try {
            let data = await sablierContract.methods.createStream(recipient, amount, tokenAddress,
                startTime.toString(), stopTime.toString()).send({from: this.state.account});
            let streamId = data.events.CreateStream.returnValues.streamId;
            this.setState({streamId: streamId.toString()});
        } catch (e) {
            alert('Create Stream Failed');
            console.log(e);
        }
        await this.updateTokenBalances();
        this.setState({loadingCreateStream: false});
    }

    async withdrawStream() {
        let streamId = this.state.withdrawStreamId;
        let streamWithdrawAmount = this.state.streamWithdrawAmount;
        if (streamId === '' || streamWithdrawAmount === '') {
            alert('All fields are required');
            return
        }
        this.setState({loadingWithdrawStream: true});
        const sablierContract = new this.state.web3.eth.Contract(Sablier, sablierAddress);
        let stream;
        try {
            stream = await sablierContract.methods.getStream(streamId).call();
        } catch (e) {
            alert('Either Stream does not exist or amount is already withdrawn from stream');
            this.setState({loadingWithdrawStream: false});
            return;
        }
        let tokenAddress = stream['tokenAddress'];
        let remainingBalance = parseInt(stream['remainingBalance']);
        let remainingBalanceHuman;
        const erc20Contract = new this.state.web3.eth.Contract(ERC20ABI, tokenAddress);
        let decimals = await erc20Contract.methods.decimals().call();
        try {
            if (decimals === '6') {
                streamWithdrawAmount = this.state.web3.utils.toWei(streamWithdrawAmount, "mwei");
                remainingBalanceHuman = this.state.web3.utils.fromWei(stream['remainingBalance'], "mwei").toString();
            } else {
                streamWithdrawAmount = this.state.web3.utils.toWei(streamWithdrawAmount, "ether");
                remainingBalanceHuman = this.state.web3.utils.fromWei(stream['remainingBalance'], "ether").toString();
            }
        } catch (e) {
            alert('Only ' + decimals + ' decimals are supported for the stream token');
            this.setState({loadingWithdrawStream: false});
            return
        }
        if (streamWithdrawAmount > remainingBalance) {
            alert('Withdraw from Stream Failed since stream balance is ' + remainingBalanceHuman);
            this.setState({loadingWithdrawStream: false});
            return;
        }
        try {
            await sablierContract.methods.withdrawFromStream(streamId, streamWithdrawAmount.toString()).send({from: this.state.account});
        } catch (e) {
            console.log(e);
            alert('Withdraw from Stream Failed');
        }
        await this.updateTokenBalances();
        this.setState({loadingWithdrawStream: false});
    }

    render() {
        if (this.state.account === '') {
            return (
                <div>
                    <Navbar bg="primary" variant="dark">
                        <div style={{width: "90%"}}>
                            <Navbar.Brand href="/">
                                <b>Mainstream Crypto</b>
                            </Navbar.Brand>
                        </div>
                        <Button variant="default btn-sm" onClick={this.login.bind(this)} style={{float: "right"}}>
                            Connect
                        </Button>
                    </Navbar>
                    <div className="panel-landing  h-100 d-flex" id="section-1">
                        <div className="container row" style={{marginTop: "50px"}}>
                            <div className="col l8 m12">

                                <p className="h2">
                                    Bringing Crypto to the masses
                                </p>
                                <p className="h6" style={{marginTop: "10px"}}>
                                    Easily send, receive or stream crypto dollars
                                </p>
                                <Image src="/USDC.png"
                                       style={{height: "320px", width: "650px", marginTop: "10px"}} fluid/>

                            </div>
                        </div>
                    </div>
                    <br/>
                    <br/>
                    <br/>
                </div>

            )
        }
        return (
            <div className="App">
                <div>

                    <Navbar bg="primary" variant="dark" style={{position: "sticky"}} fixed="top">
                        <div style={{width: "90%"}}>
                            <Navbar.Brand href="/">
                                <b>Mainstream Crypto</b>
                            </Navbar.Brand>
                        </div>
                        <Button variant="default btn-sm" onClick={this.logout.bind(this)} style={{float: "right"}}>
                            Logout
                        </Button>
                    </Navbar>

                    <div style={{margin: "20px"}}>
                        <div>
                            <div style={{wordWrap: "break-word"}}><b>Account:</b> {this.state.account}</div>
                            <div><b>Balance:</b> {this.state.tokenBalances['USDC']}</div>
                            <div>
                                <Button variant="primary btn-sm" onClick={this.buyUSDC.bind(this)}
                                        loading={this.state.loadingBuy}>
                                    Buy
                                </Button>
                            </div>
                            <br/>

                            <h5>Send</h5>
                            <div style={{marginBottom: "10px"}}>
                            </div>
                            <div style={{marginBottom: "10px"}}>
                                <input className="form-control" type="text" placeholder="Amount"
                                       value={this.state.sendAmount}
                                       onChange={e => this.updateSendAmount(e.target.value)}/>
                            </div>
                            <div style={{marginBottom: "10px"}}>
                                <input className="form-control" type="text" placeholder="Recipient Address"
                                       value={this.state.sendAddress}
                                       onChange={e => this.updateSendAddress(e.target.value)}/>
                            </div>
                            <div style={{marginBottom: "5px"}}>
                                <Button variant="primary btn" onClick={this.sendToken.bind(this)}
                                        loading={this.state.loadingSend}
                                >Send</Button>
                            </div>
                            <br/>


                            <h5>Stream payment</h5>
                            <div style={{marginBottom: "10px"}}>
                                <input className="form-control" type="text" placeholder="Amount"
                                       value={this.state.streamAmount}
                                       onChange={e => this.updateStreamAmount(e.target.value)}/>
                            </div>
                            <div style={{marginBottom: "10px"}}>
                                <Datetime inputProps={{placeholder: 'Start Time'}}
                                          onChange={value => this.updateStreamStartTime(value)}
                                          value={this.state.streamStartTime}/>
                            </div>
                            <div style={{marginBottom: "10px"}}>
                                <Datetime inputProps={{placeholder: 'Stop Time'}}
                                          onChange={value => this.updateStreamStopTime(value)}
                                          value={this.state.streamStopTime}/>
                            </div>
                            <div style={{marginBottom: "10px"}}>
                                <input className="form-control" type="text" placeholder="Recipient Address"
                                       value={this.state.streamRecipient}
                                       onChange={e => this.updateStreamRecipient(e.target.value)}/>
                            </div>
                            <div style={{marginBottom: "5px"}}>
                                <Button variant="primary btn" onClick={this.createStream.bind(this)}
                                        loading={this.state.loadingCreateStream}
                                >Create Stream</Button>
                            </div>
                            {this.state.streamId &&
                            <div>
                                Stream id: {this.state.streamId}
                            </div>
                            }
                            <br/>


                            <h5>Claim Stream Payment</h5>
                            <div style={{marginBottom: "10px"}}>
                                <input className="form-control" type="text" placeholder="Stream Id"
                                       value={this.state.withdrawStreamId}
                                       onChange={e => this.updateWithdrawStreamId(e.target.value)}/>
                            </div>
                            <div style={{marginBottom: "10px"}}>
                                <input className="form-control" type="text" placeholder="Withdraw Amount"
                                       value={this.state.streamWithdrawAmount}
                                       onChange={e => this.updateStreamWithdrawAmount(e.target.value)}/>
                            </div>
                            <div style={{marginBottom: "5px"}}>
                                <Button variant="primary btn" onClick={this.withdrawStream.bind(this)}
                                        loading={this.state.loadingWithdrawStream}
                                >Withdraw</Button>
                            </div>
                            <br/>

                        </div>
                    </div>
                </div>
            </div>
        )
    }
}

export default App
