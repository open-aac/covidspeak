Rails.application.routes.draw do
  # For details on the DSL available within this file, see http://guides.rubyonrails.org/routing.html
  root 'index#index' 
  get '/thanks' => 'index#thanks'
  get '/rooms/:room_id' => 'index#room'
  get '/rooms/:room_id/join' => 'index#join'

  scope 'api/v1', module: 'api' do
    resources :rooms
    resources :users
  end
end
