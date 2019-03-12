import React, { Component } from 'react';
import 'reset-css/reset.css';
import './App.css';
import queryString from 'query-string';
import querystring from 'querystring';

let defaultStyle = {
  color: '#fff',
  'font-family': 'Papyrus'
};

let backEndUrl = window.location.href.includes('localhost') ? "http://localhost:8888" : "https://mod3backend.herokuapp.com"

function isEven(number) {
  return number % 2
}

class Filter extends Component {
  render() {
    return (
      <div style={defaultStyle}>
        <input type="text" onKeyUp={event => 
          this.props.onTextChange(event.target.value)}
          style={{...defaultStyle, 
            color: 'black', 
            'font-size': '20px', 
            padding: '10px'}}/>
      </div>
    );
  }
}

class Playlist extends Component {
  render() {
    let playlist = this.props.playlist
    return (
      <div style={{...defaultStyle, 
        display: 'inline-block', 
        width: "25%",
        padding: '10px',
        'background-color': isEven(this.props.index) 
          ? '#C0C0C0' 
          : '#808080'
        }}
        onClick={() => {
          if(this.props.connected) {
            playlist.songs.forEach(track => {
              this.props.vote(track)
              console.log("voting for: " + track.name)
            })
          }
        }}>
        <h2>{playlist.name}</h2>
        <img src={playlist.imageUrl} alt="" style={{width: '60px'}}/>
        <ul style={{'margin-top': '10px', 'font-weight': 'bold'}}>
          {playlist.songs.map(song => 
            <li style={{'padding-top': '2px'}}>{song.name}</li>
          )}
        </ul>
      </div>
    );
  }
}

class Song extends Component {
  render() { return (
    <div onClick={() => {
      if(this.props.connected) {
        this.props.vote(this.props.track)
        console.log("voting for: " + this.props.track.name)
      }
    }}>
      {this.props.track.name}
    </div>
  )}
}

class App extends Component {
  constructor() {
    super();
    this.state = {
      playlistSearch: '',
      connectCode: undefined,
      venueName: undefined,
      recentlyPlayed : [],
      recentlyPlayedSearch : '',
      searchResults : []
    }
  }
  componentDidMount() {
    let parsed = queryString.parse(window.location.search);
    let accessToken = parsed.access_token;
    this.setState({"accessToken" : accessToken})
    if (!accessToken)
      return;
    fetch('https://api.spotify.com/v1/me', {
      headers: {'Authorization': 'Bearer ' + accessToken}
    }).then(response => response.json())
    .then(data => this.setState({
      user: {
        name: data.display_name
      }
    }))

    fetch('https://api.spotify.com/v1/me/playlists', {
      headers: {'Authorization': 'Bearer ' + accessToken}
    }).then(response => response.json())
    .then(playlistData => {
      let playlists = playlistData.items
      let trackDataPromises = playlists.map(playlist => {
        let responsePromise = fetch(playlist.tracks.href, {
          headers: {'Authorization': 'Bearer ' + accessToken}
        })
        let trackDataPromise = responsePromise
          .then(response => response.json())
        return trackDataPromise
      })
      let allTracksDataPromises = 
        Promise.all(trackDataPromises)
      let playlistsPromise = allTracksDataPromises.then(trackDatas => {
        trackDatas.forEach((trackData, i) => {
          playlists[i].trackDatas = trackData.items
            .map(item => item.track)
        })
        return playlists
      })
      return playlistsPromise
    })
    .then(playlists => this.setState({
      playlists: playlists.map(item => {
        return {
          name: item.name,
          imageUrl: item.images[0].url, 
          songs: item.trackDatas
        }
    })
    }))

    fetch('https://api.spotify.com/v1/me/player/recently-played?type=track&limit=10', {
      headers: {'Authorization': 'Bearer ' + accessToken}
    })
    .then(function(response) {
      if(response.status === 200) {
        return response.json()
      } else {
        throw new Error("Could not get recently played songs")
      }
    })
    .then(response => {
      this.setState({
        recentlyPlayed : response.items.map(item => item.track)
      })
    })
  }
  upDateQueue() {
    fetch(backEndUrl + '/queue?' +
    querystring.stringify({
      connectCode : this.state.connectCode
    }), {
      method : "GET"
    })
    .then(response => {
      return response.json();
    })
    .then(queue => {
      this.setState({queue : queue});
    })
  }
  nextTrack() {
    var _this = this;
    var bestTrack;
    fetch(backEndUrl + '/queue?' +
    querystring.stringify({
      connectCode : this.state.connectCode
    }), {
      method : "GET"
    })
    .then(response => {
      return response.json();
    })
    .then(response => {
      let tracks = response;
      bestTrack = {
        numVotes : -1,
        isDummy : true
      }
      for(let i=0; i<tracks.length; i++) {
        let track = tracks[i];
        if((!track.wasPlayed) && track.numVotes > bestTrack.numVotes) {
          bestTrack = track;
        }
      }
      if(bestTrack.isDummy) {
        throw new Error("No unplayed songs in the queue")
      }
    })
    .then(() => {
      fetch('https://api.spotify.com/v1/me/player/play' +
      (_this.state.device_id ? "?" + querystring.stringify({"device_id" : _this.state.device_id}) : ""), {
        method : "PUT",
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + _this.state.accessToken
        },
        body : JSON.stringify({"uris": [bestTrack.uri]})
      })
      .then(response => {
        if(response.status === 204) {
          console.log("Playing: " + bestTrack.name)
          _this.setState({
            current_track : bestTrack
          })
        } else {
          _this.setState({
            current_track : undefined
          })
          throw new Error("Failed to play song"); // don't setPlayed
        }
      })
    })
    .then(() => {
      fetch(backEndUrl + '/setPlayed', {
        method : "PUT",
        headers : {
          'Content-Type': 'application/json;charset=UTF-8'
        },
        body : JSON.stringify({
          connectCode : _this.state.connectCode,
          hostCode : _this.state.hostCode,
          track : bestTrack
        })
      })
    })
  }
  connectToWebPlayer() {
    var _this = this;
    let connectFunction = () => {
      console.log("connecting to Spotify Web Playback SDK")
      const player = new window.Spotify.Player({
        name: 'The Queue Player',
        getOAuthToken: cb => { cb(_this.state.accessToken); }
      });
      player.addListener('ready', ({ device_id }) => {
          _this.setState({
          "device_id" : device_id
        })
        console.log('Ready with Device ID', device_id);
      });
      player.addListener('player_state_changed', state => {
        console.log(state);
        if(_this.state.current_track === undefined
            || state.track_window.current_track.uri !== _this.state.current_track.uri
            || (state.paused && _this.state.isPlaying)) {
              _this.nextTrack();
        }
        _this.setState({
          isPlaying : !state.paused
        })
      });
      player.connect()
      .then(success => {
        if(success) {
          console.log("connected to web playback")
        } else {
          console.log("failed to connect to web playback")
        }
      })
      _this.setState({
        webPlayer : player
      })
    }
    if(window.Spotify) {
      connectFunction();
    } else {
      console.log("waiting for Spotify script to load")
      window.onSpotifyWebPlaybackSDKReady = connectFunction;
    }
  }
  vote(track) {
    fetch(backEndUrl + '/vote', {
      method : "PUT",
      headers : {
        'Content-Type': 'application/json;charset=UTF-8'
      },
      body : JSON.stringify({
        "connectCode" : this.state.connectCode,
        "access_token" : this.accessToken,
        "track" : track
      })
    })
  }
  searchSpotify(text) {
    let _this = this
    if(text !== '') {
      fetch('https://api.spotify.com/v1/search?' +
        querystring.stringify({
          q : text,
          type : "track",
          limit : "10"
        }), {
        headers: {'Authorization': 'Bearer ' + _this.state.accessToken}
      })
      .then(function(response) {
        if(response.status === 200) {
          return response.json()
        } else {
          throw new Error("Could not search Spotify")
        }
      })
      .then(response => {
        _this.setState({
          searchResults : response.tracks.items
        })
      })
    } else {
      _this.setState({
        searchResults : []
      })
    }
  }
  render() {
    let playlistToRender = 
      this.state.user && 
      this.state.playlists 
        ? this.state.playlists.filter(playlist => {
          let matchesPlaylist = playlist.name.toLowerCase().includes(
            this.state.playlistSearch.toLowerCase()) 
          let matchesSong = playlist.songs.find(song => song.name.toLowerCase()
            .includes(this.state.playlistSearch.toLowerCase()))
          return matchesPlaylist || matchesSong
        }) : []
    let recentlyPlayedToRender = 
      this.state.user &&
      this.state.recentlyPlayed.filter(track =>
        track.name.toLowerCase().includes(
          this.state.recentlyPlayedSearch.toLowerCase()
        )
      )
    return (
      <div className="App">
        {this.state.user ?
        <div>
          <h1 style={{...defaultStyle,
            'font-size': '54px',
            'margin-top': '5px'
          }}>The Queue</h1>
          <h1 style={{...defaultStyle, 
            'font-size': '54px',
            'margin-top': '5px'
          }}>
            Welcome, {this.state.user.name}.
          </h1>

          Search Your Playlists:
          <Filter onTextChange={text => {
              this.setState({playlistSearch: text})
            }}/>
          {playlistToRender.map((playlist, i) => 
            <Playlist playlist={playlist} index={i}
              connected={this.state.connectCode !== undefined} vote={t => this.vote(t)}/>
          )}

          Search Your Recently Played Songs:
          <Filter onTextChange={text => {
              this.setState({recentlyPlayedSearch: text})
            }}/>
          {recentlyPlayedToRender.map(track => 
            <Song track={track} connected={this.state.connectCode !== undefined} vote={t => this.vote(t)}/>
          )}

          Search Spotify:
          <Filter onTextChange={text => {
            this.searchSpotify(text)
          }}/>
          {this.state.searchResults.map(track => 
            <Song track={track} connected={this.state.connectCode !== undefined} vote={t => this.vote(t)}/>
          )}

          {this.state.isPlaying === true &&
            <button onClick={() => {
              fetch('https://api.spotify.com/v1/me/player/pause' +
              (this.state.device_id ? "?" + querystring.stringify({"device_id" : this.state.device_id}) : ""), {
                method : "PUT",
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': 'Bearer ' + this.state.accessToken
                }
              })
              .then(response => {
                if(response.status === 204) {
                  this.setState({
                    isPlaying : false
                  })
                } else {
                  throw new Error("failed to pause song")
                }
              })
            }}>Pause</button>
          }
          {this.state.isPlaying === false &&
            <button onClick={() => {
              fetch('https://api.spotify.com/v1/me/player/play' +
              (this.state.device_id ? "?" + querystring.stringify({"device_id" : this.state.device_id}) : ""), {
                method : "PUT",
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': 'Bearer ' + this.state.accessToken
                }
              })
              .then(response => {
                if(response.status ===204) {
                  this.setState({
                    isPlaying : true
                  })
                } else {
                  throw new Error("failed to resume song")
                }
              })
            }}>Play</button>
          }

          <button onClick={() => {
            let name = prompt("Enter name: ");
            fetch(backEndUrl + '/create', {
              method : "POST",
              headers : {
                'Content-Type': 'application/json;charset=UTF-8'
              },
              body : JSON.stringify({"name" : name})
            })
            .then(function(response) {
              return response.json();
            })
            .then(response => {
              this.setState({
                connectCode : response.newConnectCode,
                hostCode : response.newHostCode,
                venueName : name
              })
              console.log("connectCode: " + JSON.stringify(response.newConnectCode))
              this.connectToWebPlayer();
              if(window.updateQueueIntervalId) {
                clearInterval(window.updateQueueIntervalId);
              }
              let intervalId = setInterval((() => this.upDateQueue()), 3000)
              window.updateQueueIntervalId = intervalId
            })
          }}
          style={{padding: '20px', 'font-size': '50px', 'margin-top': '20px'}}>Create</button>

          {this.state.connectCode ?
          <div> 
            <h2>Connected To: {this.state.venueName}</h2>
            {this.state.hostCode && (this.state.device_id ? 
              <div>
                <button onClick={() => {
                  this.nextTrack.bind(this);
                  this.nextTrack()
                }}
                style={{padding: '20px', 'font-size': '50px', 'margin-top': '20px'}}>Play song</button>
              </div>
            : <div>Connecting to web player</div>)}

            <button onClick={() => {
              this.setState({
                connectCode: undefined,
                hostCode : undefined,
                venueName: undefined
              })
              if(this.state.webPlayer) {
                this.state.webPlayer.disconnect();
              }
              if(window.updateQueueIntervalId) {
                clearInterval(window.updateQueueIntervalId);
              }
            }}
            style={{padding: '20px', 'font-size': '50px', 'margin-top': '20px'}}>Leave</button>
          </div>
           : 
          <button onClick={() => {
            let connectCode = prompt("Enter connectCode: ");
            fetch(backEndUrl + '/join?' +
            querystring.stringify({
              "connectCode" : connectCode
            }), {
              method : "GET"
            })
            .then(function(response) {
              if(response.status === 200) {
                return response.json()
              } else {
                throw new Error("Failed to join veneue")
              }
            })
            .then(response => {
              let venueName = response.venueName
              this.setState({
                connectCode: connectCode,
                venueName: venueName
              })
              console.log("Connected to: " + venueName)
              if(window.updateQueueIntervalId) {
                clearInterval(window.updateQueueIntervalId);
              }
              let intervalId = setInterval((() => this.upDateQueue()), 3000)
              window.updateQueueIntervalId = intervalId
            })
            }
          }
          style={{padding: '20px', 'font-size': '50px', 'margin-top': '20px'}}>Join</button>
          }
        </div>
         : 
        <button onClick={() => {
            window.location = backEndUrl + '/login'
          }}
          style={{padding: '20px', 'font-size': '50px', 'margin-top': '20px'}}>Sign in with Spotify</button>
        }
      </div>
    );
  }
}

export default App;
